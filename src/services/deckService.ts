import type { ArenaVariantId } from "../lib/arenaVariant";
import type { RuleProfileId } from "../lib/ruleProfile";
import type { DeckValidationResult } from "../lib/deckValidator";

export type MatchJoinOptions = {
    ruleProfile?: RuleProfileId;
    arenaVariant?: ArenaVariantId;
    deckCardIds?: string[];
};

export async function fetchDefaultDeck(options?: {
    playerIndex?: number;
    random?: boolean;
}): Promise<string[]> {
    const params = new URLSearchParams();
    if (options?.random !== false && options?.playerIndex == null) {
        params.set("random", "1");
    } else if (options?.playerIndex != null) {
        params.set("playerIndex", String(options.playerIndex));
        params.set("random", "0");
    } else if (options?.random === false) {
        params.set("playerIndex", "0");
        params.set("random", "0");
    }
    const qs = params.toString();
    const res = await fetch(`/api/decks/default${qs ? `?${qs}` : ""}`);
    if (!res.ok) {
        throw new Error("failed_to_load_default_deck");
    }
    const data = (await res.json()) as { cardIds?: string[] };
    if (!Array.isArray(data.cardIds)) {
        throw new Error("invalid_default_deck_response");
    }
    return data.cardIds;
}

export async function validateDeckRemote(
    cardIds: string[],
    ruleProfile: RuleProfileId = "fidelity_ps1",
    arenaVariant: ArenaVariantId = "standard"
): Promise<DeckValidationResult> {
    const res = await fetch("/api/decks/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cardIds, ruleProfile, arenaVariant }),
    });
    return (await res.json()) as DeckValidationResult;
}

export function formatJoinError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    if (message.startsWith("invalid_deck:")) {
        const parts = message.split(":");
        const detail = parts.slice(2).join(":").trim();
        return detail.length > 0 ? detail : "Invalid deck — check card list and arena rules.";
    }
    if (message === "rule_profile_mismatch") {
        return "Rule profile does not match the room. Try again.";
    }
    if (message === "arena_variant_mismatch") {
        return "Arena variant does not match the room. Try again.";
    }
    return message || "Failed to join match.";
}
