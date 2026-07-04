/**
 * PS1 base decks from GameFAQs (ZeoKnight FAQ), built by tools/parse_base_decks.py.
 */

import decksData from "../data/decks.json";
import type { NormalizedCardCatalogEntry } from "./cardCatalogLoader";
import { validateDeck } from "./deckValidator";
import type { ArenaVariant } from "./arenaVariant";
import { resolveArenaVariant } from "./arenaVariant";

export type BaseDeckEntry = {
    cardId: string;
    name: string;
    count: number;
    sourceName?: string;
};

export type BaseDeck = {
    id: string;
    name: string;
    aka?: string;
    colors?: string;
    owner?: string;
    entries: BaseDeckEntry[];
    cardIds: string[];
    size: number;
    unresolved: { name: string; count: number }[];
    notes: string[];
    valid: boolean;
};

const ALL_DECKS = (decksData as { decks: BaseDeck[] }).decks;

export function listBaseDecks(opts?: { validOnly?: boolean }): BaseDeck[] {
    if (opts?.validOnly) return ALL_DECKS.filter(d => d.valid);
    return ALL_DECKS;
}

export function getBaseDeckById(id: string): BaseDeck | undefined {
    return ALL_DECKS.find(d => d.id === id);
}

/** Valid base decks that also pass live catalog + arena validation. */
export function listPlayableBaseDecks(
    catalogById: ReadonlyMap<string, NormalizedCardCatalogEntry>,
    arenaVariant: ArenaVariant = resolveArenaVariant("standard")
): BaseDeck[] {
    return ALL_DECKS.filter(d => {
        if (!d.valid || d.cardIds.length !== 30) return false;
        return validateDeck(d.cardIds, catalogById, arenaVariant).ok === true;
    });
}
