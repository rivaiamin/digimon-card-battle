/**
 * Explicit arena / match rule variants (FC-029 / RA-007).
 * Variants layer deck restrictions on top of a rule profile — no hidden ad-hoc branches.
 */

import type { RuleProfileId } from "./ruleProfile";

export type ArenaVariantId = "standard" | "no_options";

export interface ArenaVariant {
    id: ArenaVariantId;
    label: string;
    ruleProfileId: RuleProfileId;
    allowOptionCards: boolean;
    allowEvolutionOptionCards: boolean;
}

const VARIANTS: Record<ArenaVariantId, ArenaVariant> = {
    standard: {
        id: "standard",
        label: "Standard Ranked",
        ruleProfileId: "fidelity_ps1",
        allowOptionCards: true,
        allowEvolutionOptionCards: true,
    },
    no_options: {
        id: "no_options",
        label: "No Options",
        ruleProfileId: "fidelity_ps1",
        allowOptionCards: false,
        allowEvolutionOptionCards: false,
    },
};

/** Legacy online testing variant — uses legacy profile, all card kinds allowed. */
const LEGACY_STANDARD: ArenaVariant = {
    id: "standard",
    label: "Legacy Online",
    ruleProfileId: "legacy_online",
    allowOptionCards: true,
    allowEvolutionOptionCards: true,
};

export function resolveArenaVariant(
    raw: unknown,
    ruleProfileId: RuleProfileId = "fidelity_ps1"
): ArenaVariant {
    if (raw === "no_options") return VARIANTS.no_options;
    if (ruleProfileId === "legacy_online") return LEGACY_STANDARD;
    return VARIANTS.standard;
}

export function listArenaVariants(ruleProfileId: RuleProfileId = "fidelity_ps1"): ArenaVariant[] {
    if (ruleProfileId === "legacy_online") {
        return [LEGACY_STANDARD];
    }
    return [VARIANTS.standard, VARIANTS.no_options];
}

export function arenaVariantMatchesRuleProfile(
    variant: ArenaVariant,
    ruleProfileId: RuleProfileId
): boolean {
    return variant.ruleProfileId === ruleProfileId;
}
