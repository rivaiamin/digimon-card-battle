import type { NormalizedCardCatalogEntry } from "./cardCatalogLoader";
import type { ArenaVariant } from "./arenaVariant";
import {
    CANONICAL_DECK_CONSTRAINTS,
    type DeckConstraints,
} from "./deckConstraints";

export type DeckValidationResult =
    | { ok: true }
    | {
          ok: false;
          reason: string;
          message: string;
          details?: Record<string, unknown>;
      };

function isRookieLevel(level: string): boolean {
    return String(level).toLowerCase() === "rookie";
}

/**
 * Validate a 30-card deck list (catalog base ids) against constraints and arena variant.
 */
export function validateDeck(
    cardIds: readonly string[],
    catalogById: ReadonlyMap<string, NormalizedCardCatalogEntry>,
    arenaVariant: ArenaVariant,
    constraints: DeckConstraints = CANONICAL_DECK_CONSTRAINTS
): DeckValidationResult {
    if (cardIds.length !== constraints.deckSize) {
        return {
            ok: false,
            reason: "deck_wrong_size",
            message: `Deck must contain exactly ${constraints.deckSize} cards (got ${cardIds.length}).`,
            details: { expected: constraints.deckSize, actual: cardIds.length },
        };
    }

    const copyCounts = new Map<string, number>();
    let rookieCount = 0;

    for (const cardId of cardIds) {
        const entry = catalogById.get(cardId);
        if (!entry) {
            return {
                ok: false,
                reason: "unknown_card_id",
                message: `Unknown card id "${cardId}" — not in the catalog.`,
                details: { cardId },
            };
        }

        if (entry.cardKind === "option" && !arenaVariant.allowOptionCards) {
            return {
                ok: false,
                reason: "option_card_not_allowed",
                message: `Option cards are not allowed in arena "${arenaVariant.id}".`,
                details: { cardId, arenaVariant: arenaVariant.id },
            };
        }

        if (entry.cardKind === "evolution_option" && !arenaVariant.allowEvolutionOptionCards) {
            return {
                ok: false,
                reason: "evolution_option_not_allowed",
                message: `Evolution option cards are not allowed in arena "${arenaVariant.id}".`,
                details: { cardId, arenaVariant: arenaVariant.id },
            };
        }

        if (isRookieLevel(entry.level)) {
            rookieCount += 1;
        }

        const next = (copyCounts.get(cardId) ?? 0) + 1;
        copyCounts.set(cardId, next);
        const maxCopies = constraints.maxCopiesByKind[entry.cardKind] ?? 4;
        if (next > maxCopies) {
            return {
                ok: false,
                reason: "too_many_copies",
                message: `Too many copies of "${entry.name}" (${cardId}): max ${maxCopies} for ${entry.cardKind} cards.`,
                details: { cardId, name: entry.name, copies: next, maxCopies, cardKind: entry.cardKind },
            };
        }
    }

    if (rookieCount < constraints.minRookies) {
        return {
            ok: false,
            reason: "missing_rookie",
            message: `Deck must include at least ${constraints.minRookies} Rookie Digimon.`,
            details: { rookieCount, required: constraints.minRookies },
        };
    }

    return { ok: true };
}

export function formatDeckValidationError(result: DeckValidationResult): string {
    if (result.ok === false) return result.message;
    return "";
}