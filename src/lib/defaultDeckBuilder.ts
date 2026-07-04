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
    const optionCards = catalog.filter(
        c => c.cardKind === "option" || c.cardKind === "evolution_option"
    );
    const counts = new Map<string, number>();
    const deck: string[] = [];

    const start = playerIndex % Math.max(1, digimonCards.length);
    let cursor = start;

    const pushCard = (raw: NormalizedCardCatalogEntry, maxCopies: number) => {
        const baseId = String(raw.id);
        const n = counts.get(baseId) ?? 0;
        if (n >= maxCopies) return false;
        counts.set(baseId, n + 1);
        deck.push(baseId);
        return true;
    };

    for (const raw of optionCards) {
        if (deck.length >= 26) break;
        pushCard(raw, 1);
    }

    while (deck.length < CANONICAL_DECK_SIZE && digimonCards.length > 0) {
        const before = deck.length;
        const raw = digimonCards[cursor];
        cursor = (cursor + 1) % digimonCards.length;
        pushCard(raw, 4);
        if (deck.length === before) {
            // All digimon at copy cap — stop to avoid infinite loop on small catalogs.
            break;
        }
    }

    return deck;
}
