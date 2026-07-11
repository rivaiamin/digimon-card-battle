/**
 * Online-deck support gamble (FC-013 / P3-4).
 * PS1 "All-or-Nothing": use the top card of the Online Deck (draw pile) as Support/Option
 * instead of choosing from hand. Wikimon: hand OR top of deck.
 * @see docs/fidelity-rules-contract.md FC-013
 */

/** Mutable deck contract (works with Colyseus ArraySchema). */
export interface MutableDeckLike<T> {
    readonly length: number;
    shift(): T | undefined;
}

export function canGambleOnlineDeckSupport(deckSize: number): boolean {
    return deckSize > 0;
}

/**
 * Draw the top Online Deck card for use as support.
 * Returns null if the deck is empty (illegal gamble).
 */
export function drawOnlineDeckSupport<T>(deck: MutableDeckLike<T>): T | null {
    if (deck.length <= 0) return null;
    return deck.shift() ?? null;
}

export type OnlineDeckGambleResult<T> =
    | { ok: true; card: T; deckSizeAfter: number }
    | { ok: false; reason: "empty_deck" | "gamble_disabled" };

export function attemptOnlineDeckSupportGamble<T>(
    deck: MutableDeckLike<T>,
    enabled: boolean
): OnlineDeckGambleResult<T> {
    if (!enabled) return { ok: false, reason: "gamble_disabled" };
    if (!canGambleOnlineDeckSupport(deck.length)) {
        return { ok: false, reason: "empty_deck" };
    }
    const card = drawOnlineDeckSupport(deck);
    if (!card) return { ok: false, reason: "empty_deck" };
    return { ok: true, card, deckSizeAfter: deck.length };
}
