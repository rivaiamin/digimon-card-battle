import { canEvolveDigimon, matchesEvolutionType } from "./evolutionEligibility";
import {
    canPlayEvolutionOption,
    canPlayPrepOption,
    canUseAsBattleSupport,
    type OptionCardLike,
} from "./optionEligibility";
import { validateDeployDigimon, type MinimalCard } from "./openingFlow";
import { canEvolveWithOption, type EvolutionModifiers } from "./optionResolver";
import type { RuleProfile } from "./ruleProfile";
import type { DigimonCardData, GameState } from "../types";

export type HandCardMode =
    | "inactive"
    | "view"
    | "deploy"
    | "discard"
    | "prep_option"
    | "evolve_target"
    | "evolve_option"
    | "support";

export type HandCardInteraction = {
    mode: HandCardMode;
    enabled: boolean;
    ringClass: string;
    badge: string | null;
    statusHint: string | null;
};

export type HandInteractionContext = {
    phase: GameState["phase"];
    prepSubPhase: GameState["prepSubPhase"];
    isYourTurn: boolean;
    hasActive: boolean;
    playerDp: number;
    activeDigimon: DigimonCardData | null;
    selectedEvoOptionId: string | null;
    evoModifiers: EvolutionModifiers;
    canPickSupport: boolean;
    supportLocked: boolean;
    ruleProfile: RuleProfile;
    needsOpeningDeploy: boolean;
    selectedEvoOption: DigimonCardData | null;
};

const INACTIVE: HandCardInteraction = {
    mode: "inactive",
    enabled: false,
    ringClass: "",
    badge: null,
    statusHint: null,
};

const VIEW: HandCardInteraction = {
    mode: "view",
    enabled: false,
    ringClass: "",
    badge: null,
    statusHint: null,
};

/** PS1-style: card stays in the hand strip at full opacity; not clickable. */
function visibleOnly(): HandCardInteraction {
    return VIEW;
}

function asOptionLike(card: DigimonCardData): OptionCardLike {
    return {
        cardKind: card.cardKind,
        effectId: card.effectId ?? "",
        supportEffect: card.supportEffect ?? null,
    };
}

function toMinimalCard(card: DigimonCardData): MinimalCard {
    return {
        id: card.id,
        level: card.level,
        cardKind: card.cardKind,
        hp: card.hp,
        maxHp: card.maxHp,
        circle: { damage: card.attacks?.circle.damage ?? 0 },
        triangle: { damage: card.attacks?.triangle.damage ?? 0 },
        cross: { damage: card.attacks?.cross.damage ?? 0 },
    };
}

export function getHandCardInteraction(
    card: DigimonCardData,
    ctx: HandInteractionContext
): HandCardInteraction {
    const { phase, prepSubPhase, isYourTurn } = ctx;

    if (phase === "waiting" || phase === "victory") return INACTIVE;

    if (phase === "draw") {
        return VIEW;
    }

    if (phase === "preparation" && prepSubPhase === "mulligan") {
        return VIEW;
    }

    if (phase === "preparation" && prepSubPhase === "deploy" && isYourTurn && !ctx.hasActive) {
        if (card.cardKind !== "digimon") return visibleOnly();
        const deployOk = validateDeployDigimon(
            toMinimalCard(card),
            ctx.ruleProfile,
            ctx.needsOpeningDeploy
        ).ok;
        return {
            mode: "deploy",
            enabled: deployOk,
            ringClass: deployOk ? "ring-2 ring-ps-green ring-offset-2 ring-offset-app" : "",
            badge: deployOk
                ? card.level !== "Rookie"
                    ? `DEPLOY (${card.level})`
                    : "DEPLOY"
                : null,
            statusHint: deployOk ? null : "Cannot deploy",
        };
    }

    if (
        phase === "preparation" &&
        prepSubPhase === "discard" &&
        isYourTurn &&
        ctx.hasActive
    ) {
        if (canPlayPrepOption(asOptionLike(card), prepSubPhase, ctx.hasActive)) {
            return {
                mode: "prep_option",
                enabled: true,
                ringClass: "ring-2 ring-ps-yellow ring-offset-2 ring-offset-app",
                badge: "PLAY",
                statusHint: null,
            };
        }
        if (card.cardKind === "digimon") {
            return {
                mode: "discard",
                enabled: true,
                ringClass: "",
                badge: `+${card.plusDp} DP`,
                statusHint: "Discard for DP",
            };
        }
        return visibleOnly();
    }

    if (
        phase === "preparation" &&
        prepSubPhase === "evolve" &&
        isYourTurn &&
        ctx.hasActive
    ) {
        if (canPlayEvolutionOption(asOptionLike(card), prepSubPhase, ctx.hasActive)) {
            const selected = ctx.selectedEvoOptionId === card.id;
            return {
                mode: "evolve_option",
                enabled: true,
                ringClass: `ring-2 ring-offset-2 ring-offset-app ${
                    selected ? "ring-fg" : "ring-ps-blue"
                }`,
                badge: selected ? "SELECTED" : "ATTACH",
                statusHint: null,
            };
        }
        if (card.cardKind === "digimon") {
            const active = ctx.activeDigimon;
            const canEvolve = ctx.selectedEvoOption
                ? canEvolveWithOption(active, card, ctx.playerDp, ctx.evoModifiers)
                : canEvolveDigimon(active, card, ctx.playerDp);
            const adjustedCost = Math.max(0, card.evoCost + ctx.evoModifiers.dpCostDelta);
            const canAfford = ctx.playerDp >= adjustedCost;
            const sameType = active ? matchesEvolutionType(active.type, card.type) : false;
            let statusHint: string | null = null;
            if (!canAfford) statusHint = "NO DP";
            else if (!sameType) statusHint = "WRONG TYPE";
            else if (!canEvolve) statusHint = "INVALID";

            return {
                mode: "evolve_target",
                enabled: canEvolve,
                ringClass: canEvolve
                    ? "ring-2 ring-ps-blue ring-offset-2 ring-offset-app"
                    : "",
                badge: `COST: ${adjustedCost}`,
                statusHint,
            };
        }
        return visibleOnly();
    }

    if (phase === "battle_support" || phase === "battle_reveal") {
        if (!canUseAsBattleSupport(asOptionLike(card))) return visibleOnly();
        const enabled =
            phase === "battle_support" &&
            ctx.canPickSupport &&
            !ctx.supportLocked;
        return {
            mode: "support",
            enabled,
            ringClass: enabled ? "ring-2 ring-ps-blue ring-offset-2 ring-offset-app" : "",
            badge: card.cardKind === "option" ? "OPTION" : "SUPPORT",
            statusHint: null,
        };
    }

    if (phase === "preparation" && !isYourTurn) return visibleOnly();

    return visibleOnly();
}
