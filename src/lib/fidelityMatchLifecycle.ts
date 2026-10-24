/**
 * Colyseus-free match join / start / leave decisions.
 * @see GLOSSARY.md — Fidelity battle session vs Battle room
 */

import type { NormalizedCardCatalogEntry } from "./cardCatalogLoader";
import { buildDefaultDeckCardIds } from "./defaultDeckBuilder";
import { migrateDeckCardIds } from "./legacyCardIds";
import type { MatchEndReason } from "./matchOutcome";
import { shouldForfeitOnPermanentLeave } from "./reconnectPolicy";
import {
    arenaVariantMatchesRuleProfile,
    resolveArenaVariant,
    type ArenaVariant,
} from "./arenaVariant";
import { resolveRuleProfile, type RuleProfile, type RuleProfileId } from "./ruleProfile";

export type JoinValidationFailure = {
    ok: false;
    code:
        | "rule_profile_mismatch"
        | "arena_variant_mismatch"
        | "arena_variant_invalid";
};

export type JoinValidationResult = { ok: true } | JoinValidationFailure;

export function validateClientJoin(
    roomRuleProfile: RuleProfile,
    roomArena: ArenaVariant,
    joinRuleProfileRaw: unknown,
    joinArenaRaw: unknown
): JoinValidationResult {
    const joinProfile = resolveRuleProfile(joinRuleProfileRaw);
    if (joinProfile.id !== roomRuleProfile.id) {
        return { ok: false, code: "rule_profile_mismatch" };
    }

    const joinArena = resolveArenaVariant(joinArenaRaw, joinProfile.id);
    if (joinArena.id !== roomArena.id) {
        return { ok: false, code: "arena_variant_mismatch" };
    }
    if (!arenaVariantMatchesRuleProfile(joinArena, joinProfile.id as RuleProfileId)) {
        return { ok: false, code: "arena_variant_invalid" };
    }
    return { ok: true };
}

/** Resolve deck list from join payload or assign a default deck for the seat index. */
export function resolveJoinDeckCardIds(
    raw: unknown,
    playerIndex: number,
    catalog: readonly NormalizedCardCatalogEntry[]
): string[] {
    if (!Array.isArray(raw) || !raw.every(id => typeof id === "string")) {
        return buildDefaultDeckCardIds(catalog, playerIndex);
    }
    return migrateDeckCardIds(raw);
}

/** Fair 50/50 first player between two seated session ids (PS1 coin flip). */
export function pickFirstActiveSessionId(sessionIds: readonly string[], rng: () => number): string {
    if (sessionIds.length === 0) return "";
    if (sessionIds.length === 1) return sessionIds[0];
    return rng() < 0.5 ? sessionIds[0] : sessionIds[1];
}

export function matchEndVictoryMessage(reason: MatchEndReason): string {
    switch (reason) {
        case "deck_out":
            return "Deck Out!";
        case "afk":
            return "Match forfeited (AFK)";
        case "disconnect":
            return "A player disconnected.";
        default:
            return "Match Over";
    }
}

export function forfeitOnPermanentLeave(phase: string, playerCount: number): boolean {
    return shouldForfeitOnPermanentLeave(phase, playerCount);
}
