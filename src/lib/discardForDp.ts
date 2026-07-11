/**
 * Preparation discard-for-DP rules (FC-006).
 * @see docs/fidelity-rules-contract.md FC-006, GDD.md §5 Phase 2
 */

export type DiscardableCardLike = {
    id: string;
    cardKind: string;
    plusDp: number;
};

/** Only Digimon cards may be discarded from hand for +DP during prep discard step. */
export function canDiscardForDp(card: Pick<DiscardableCardLike, "cardKind">): boolean {
    return card.cardKind === "digimon";
}

export type DiscardForDpApplyResult = {
    dpGained: number;
    discardedIds: string[];
    rejectedIds: string[];
};

/**
 * Remove discardable cards from hand, push to trash, sum +DP.
 * Invalid or missing ids are listed in rejectedIds without mutating for those ids.
 */
export function applyDiscardForDp<T extends DiscardableCardLike>(
    hand: T[],
    trash: T[],
    cardIds: readonly string[]
): DiscardForDpApplyResult {
    const discardedIds: string[] = [];
    const rejectedIds: string[] = [];
    let dpGained = 0;
    const seen = new Set<string>();

    for (const cardId of cardIds) {
        if (seen.has(cardId)) {
            rejectedIds.push(cardId);
            continue;
        }
        seen.add(cardId);

        const idx = hand.findIndex(c => c.id === cardId);
        if (idx === -1) {
            rejectedIds.push(cardId);
            continue;
        }

        const card = hand[idx]!;
        if (!canDiscardForDp(card)) {
            rejectedIds.push(cardId);
            continue;
        }

        dpGained += card.plusDp;
        trash.push(card);
        hand.splice(idx, 1);
        discardedIds.push(cardId);
    }

    return { dpGained, discardedIds, rejectedIds };
}
