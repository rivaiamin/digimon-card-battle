import type { NormalizedCardCatalogEntry } from "./cardCatalogLoader";
import { CANONICAL_DECK_SIZE } from "./deckConstraints";
import { listPlayableBaseDecks } from "./baseDecks";
import { resolveArenaVariant } from "./arenaVariant";

export type DefaultDeckPickOptions = {
    /** Deterministic seat-based pick (tests / fallback). Ignored when `random` is true. */
    playerIndex?: number;
    /** Pick a uniform random playable base deck (matchmaking). */
    random?: boolean;
    rng?: () => number;
};

function normalizeOptions(
    playerIndexOrOptions: number | DefaultDeckPickOptions = 0
): Required<Pick<DefaultDeckPickOptions, "playerIndex" | "random">> &
    Pick<DefaultDeckPickOptions, "rng"> {
    if (typeof playerIndexOrOptions === "number") {
        return { playerIndex: playerIndexOrOptions, random: false };
    }
    return {
        playerIndex: playerIndexOrOptions.playerIndex ?? 0,
        random: playerIndexOrOptions.random === true,
        rng: playerIndexOrOptions.rng,
    };
}

/**
 * Build a legal 30-card deck as catalog base ids (shared by server fallback + API).
 * Prefers a PS1 base deck from GameFAQs when available.
 * Default matchmaking should pass `{ random: true }` so consecutive joins vary.
 */
export function buildDefaultDeckCardIds(
    catalog: readonly NormalizedCardCatalogEntry[],
    playerIndexOrOptions: number | DefaultDeckPickOptions = 0
): string[] {
    const opts = normalizeOptions(playerIndexOrOptions);
    const catalogById = new Map(catalog.map(c => [c.id, c]));
    const baseDecks = listPlayableBaseDecks(catalogById, resolveArenaVariant("standard"));
    if (baseDecks.length > 0) {
        const roll = opts.rng ?? Math.random;
        const index = opts.random
            ? Math.floor(roll() * baseDecks.length)
            : Math.abs(opts.playerIndex) % baseDecks.length;
        const deck = baseDecks[index]!;
        return [...deck.cardIds];
    }

    return buildSyntheticDefaultDeck(catalog, opts.playerIndex, opts.random ? opts.rng : undefined);
}

/** Fallback when no valid base decks are loaded. */
export function buildSyntheticDefaultDeck(
    catalog: readonly NormalizedCardCatalogEntry[],
    playerIndex: number,
    rng?: () => number
): string[] {
    const digimonCards = catalog.filter(c => c.cardKind === "digimon");
    const rookies = digimonCards.filter(c => c.level === "Rookie");
    const optionCards = catalog.filter(
        c => c.cardKind === "option" || c.cardKind === "evolution_option"
    );
    const counts = new Map<string, number>();
    const deck: string[] = [];
    const indexSalt =
        rng != null ? Math.floor(rng() * Math.max(1, digimonCards.length || 1)) : playerIndex;

    const pushCard = (raw: NormalizedCardCatalogEntry, maxCopies: number) => {
        const baseId = String(raw.id);
        const n = counts.get(baseId) ?? 0;
        if (n >= maxCopies) return false;
        counts.set(baseId, n + 1);
        deck.push(baseId);
        return true;
    };

    if (rookies.length > 0) {
        pushCard(rookies[indexSalt % rookies.length]!, 4);
    }

    const maxOptions = Math.min(7, optionCards.length);
    let optionsAdded = 0;
    for (let i = 0; i < optionCards.length && optionsAdded < maxOptions; i++) {
        const raw = optionCards[(indexSalt + i) % optionCards.length]!;
        if (pushCard(raw, 4)) optionsAdded += 1;
    }

    const orderedDigimon = [
        ...rookies,
        ...digimonCards.filter(c => c.level !== "Rookie"),
    ];
    const start = indexSalt % Math.max(1, orderedDigimon.length);
    let cursor = start;

    while (deck.length < CANONICAL_DECK_SIZE && orderedDigimon.length > 0) {
        const before = deck.length;
        const raw = orderedDigimon[cursor]!;
        cursor = (cursor + 1) % orderedDigimon.length;
        pushCard(raw, 4);
        if (deck.length === before) break;
    }

    return deck;
}
