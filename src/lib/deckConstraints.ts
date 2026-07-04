/**
 * Canonical deck size and copy limits (FC-028 / MANUAL L427).
 */

import type { CardKind } from "../types";

export const CANONICAL_DECK_SIZE = 30;

export const MAX_COPIES_BY_KIND: Record<CardKind, number> = {
    digimon: 4,
    option: 1,
    evolution_option: 1,
};

/** Minimum Rookies required so a deck can open / recover after KO. */
export const MIN_ROOKIES_REQUIRED = 1;

export interface DeckConstraints {
    deckSize: number;
    maxCopiesByKind: Record<CardKind, number>;
    minRookies: number;
}

export const CANONICAL_DECK_CONSTRAINTS: DeckConstraints = {
    deckSize: CANONICAL_DECK_SIZE,
    maxCopiesByKind: MAX_COPIES_BY_KIND,
    minRookies: MIN_ROOKIES_REQUIRED,
};
