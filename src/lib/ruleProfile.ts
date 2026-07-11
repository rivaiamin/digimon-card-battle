/**
 * Rule profiles for ranked fidelity vs legacy online behavior.
 * @see docs/fidelity-rules-contract.md §5.1, RA-001, RA-005
 */

export type RuleProfileId = "fidelity_ps1" | "legacy_online";

export interface StatMultiplier {
    /** Multiplier applied to max/current HP (e.g. 0.5 = half). */
    hp: number;
    /** Multiplier applied to all attack damages. */
    atk: number;
}

export interface OpeningDeployRules {
    allowChampion: boolean;
    allowUltimate: boolean;
    /** PS1 manual: Level C = half HP/ATK, Level U = quarter HP/ATK. */
    penalties: {
        champion: StatMultiplier;
        ultimate: StatMultiplier;
    };
}

export interface MulliganRules {
    enabled: boolean;
    /** Redraws allowed after the initial opening draw (PS1: one optional redraw). */
    maxRedraws: number;
}

export interface BattleFlowRules {
    /**
     * Fidelity: lock attacks before support (RA-002).
     * Legacy: support → reveal → attack.
     */
    attackLockBeforeSupport: boolean;
    /**
     * Fidelity: defender (attacks second) picks support before active (RA-003).
     * Legacy: simultaneous hidden lock-in.
     */
    supportPickDefenderFirst: boolean;
    /**
     * FC-013: allow All-or-Nothing gamble — top Online Deck card as support.
     */
    allowOnlineDeckGamble: boolean;
}

export interface RuleProfile {
    id: RuleProfileId;
    /** Hand size target for opening draw and turn-start refill. */
    handTarget: number;
    mulligan: MulliganRules;
    openingDeploy: OpeningDeployRules;
    battle: BattleFlowRules;
    /** After a KO, redeploy is Rookie-only in both profiles. */
    postKoDeployRookieOnly: boolean;
    /**
     * When no deployable card is in hand after draw, dig through deck.
     * fidelity_ps1: any Digimon; legacy_online: Rookie only.
     */
    digForRookieOnly: boolean;
}

const FIDELITY_PS1: RuleProfile = {
    id: "fidelity_ps1",
    handTarget: 4,
    mulligan: { enabled: true, maxRedraws: 1 },
    openingDeploy: {
        allowChampion: true,
        allowUltimate: true,
        penalties: {
            champion: { hp: 0.5, atk: 0.5 },
            ultimate: { hp: 0.25, atk: 0.25 },
        },
    },
    battle: {
        attackLockBeforeSupport: true,
        supportPickDefenderFirst: true,
        allowOnlineDeckGamble: true,
    },
    postKoDeployRookieOnly: true,
    digForRookieOnly: false,
};

const LEGACY_ONLINE: RuleProfile = {
    id: "legacy_online",
    handTarget: 6,
    mulligan: { enabled: false, maxRedraws: 0 },
    openingDeploy: {
        allowChampion: false,
        allowUltimate: false,
        penalties: {
            champion: { hp: 0.5, atk: 0.5 },
            ultimate: { hp: 0.25, atk: 0.25 },
        },
    },
    battle: {
        attackLockBeforeSupport: false,
        supportPickDefenderFirst: false,
        allowOnlineDeckGamble: true,
    },
    postKoDeployRookieOnly: true,
    digForRookieOnly: true,
};

const PROFILES: Record<RuleProfileId, RuleProfile> = {
    fidelity_ps1: FIDELITY_PS1,
    legacy_online: LEGACY_ONLINE,
};

export function resolveRuleProfile(raw: unknown): RuleProfile {
    if (raw === "legacy_online") return LEGACY_ONLINE;
    return FIDELITY_PS1;
}

export function getRuleProfile(id: RuleProfileId): RuleProfile {
    return PROFILES[id];
}
