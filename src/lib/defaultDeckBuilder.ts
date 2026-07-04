import type { NormalizedCardCatalogEntry } from "./cardCatalogLoader";
import { CANONICAL_DECK_SIZE } from "./deckConstraints";

/**
 * Build a legal 30-card deck as catalog base ids (shared by server fallback + API).
 */
export function buildDefaultDeckCardIds(
    catalog: readonly NormalizedCardCatalogEntry[],
    playerIndex: number
): string[] {
    const digimonCards = catalog.filter(c => c.cardKind === "digimon");
    const rookies = digimonCards.filter(c => c.level === "Rookie");
    const optionCards = catalog.filter(
        c => c.cardKind === "option" || c.cardKind === "evolution_option"
    );
    const counts = new Map<string, number>();
    const deck: string[] = [];

    const pushCard = (raw: NormalizedCardCatalogEntry, maxCopies: number) => {
        const baseId = String(raw.id);
        const n = counts.get(baseId) ?? 0;
        if (n >= maxCopies) return false;
        counts.set(baseId, n + 1);
        deck.push(baseId);
        return true;
    };

    // Guarantee at least one Rookie for FC-028 / opening deploy rules.
    if (rookies.length > 0) {
        pushCard(rookies[playerIndex % rookies.length], 4);
    }

    // Keep auto-decks Digimon-heavy; include a small option package (E3 backlog: up to 7).
    const maxOptions = Math.min(7, optionCards.length);
    let optionsAdded = 0;
    for (let i = 0; i < optionCards.length && optionsAdded < maxOptions; i++) {
        const raw = optionCards[(playerIndex + i) % optionCards.length];
        if (pushCard(raw, 1)) optionsAdded += 1;
    }

    // Prefer rookies, then rotate through the full Digimon pool.
    const orderedDigimon = [
        ...rookies,
        ...digimonCards.filter(c => c.level !== "Rookie"),
    ];
    const start = playerIndex % Math.max(1, orderedDigimon.length);
    let cursor = start;

    while (deck.length < CANONICAL_DECK_SIZE && orderedDigimon.length > 0) {
        const before = deck.length;
        const raw = orderedDigimon[cursor];
        cursor = (cursor + 1) % orderedDigimon.length;
        pushCard(raw, 4);
        if (deck.length === before) {
            // All digimon at copy cap — stop to avoid infinite loop on small catalogs.
            break;
        }
    }

    return deck;
}
