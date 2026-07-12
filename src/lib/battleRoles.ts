/**
 * Attacker / defender labeling for UI (FC-003 / FC-012).
 */

import {
    getPrepSubPhaseHint,
    getPrepSubPhaseTitle,
} from "./prepPhaseCopy";

export type BattleRole = "attacker" | "defender";

export function getBattleRole(sessionId: string, activePlayerSessionId: string): BattleRole {
    return sessionId === activePlayerSessionId ? "attacker" : "defender";
}

export function getOpponentBattleRole(role: BattleRole): BattleRole {
    return role === "attacker" ? "defender" : "attacker";
}

export function formatBattleRoleLabel(role: BattleRole): string {
    return role === "attacker" ? "Attacker" : "Defender";
}

export type TurnStatusPhase =
    | "draw"
    | "preparation"
    | "battle_support"
    | "battle_reveal"
    | "battle_attack"
    | "resolution"
    | "victory"
    | "other";

export interface TurnStatusContext {
    phase: TurnStatusPhase;
    prepSubPhase: "" | "mulligan" | "deploy" | "discard" | "evolve";
    yourRole: BattleRole;
    isYourTurn: boolean;
    supportPickDefenderFirst: boolean;
    isYourSupportPickTurn: boolean;
    attackLocked: boolean;
    handTarget?: number;
    mulligansRemaining?: number;
    needsOpeningDeploy?: boolean;
}

/** One-line phase title for the match header (role lives on seat plaques). */
export function getTurnStatusTitle(ctx: TurnStatusContext): string {
    if (ctx.phase === "draw") {
        return ctx.isYourTurn ? "Draw" : "Waiting · opponent draws";
    }

    if (ctx.phase === "preparation") {
        if (!ctx.isYourTurn) {
            return "Waiting · opponent prepares";
        }
        return getPrepSubPhaseTitle(ctx.prepSubPhase, {
            handTarget: ctx.handTarget,
            needsOpeningDeploy: ctx.needsOpeningDeploy,
        });
    }

    if (ctx.phase === "battle_support") {
        return "Battle · Support";
    }
    if (ctx.phase === "battle_reveal") {
        return "Battle · Reveal";
    }
    if (ctx.phase === "battle_attack") {
        return "Battle · Choose attack";
    }
    if (ctx.phase === "resolution") {
        return "Resolving battle";
    }
    if (ctx.phase === "victory") {
        return "Match over";
    }

    return "Turn";
}

/** Short action hint; empty when nothing useful to say. */
export function getTurnStatusHint(ctx: TurnStatusContext): string {
    if (ctx.phase === "draw") {
        if (!ctx.isYourTurn) return "";
        return ctx.handTarget
            ? `Drawing to ${ctx.handTarget} cards.`
            : "Drawing to hand size.";
    }

    if (ctx.phase === "preparation") {
        if (!ctx.isYourTurn) return "";
        return getPrepSubPhaseHint(ctx.prepSubPhase, {
            mulligansRemaining: ctx.mulligansRemaining,
            needsOpeningDeploy: ctx.needsOpeningDeploy,
        });
    }

    if (ctx.phase === "battle_support") {
        if (ctx.supportPickDefenderFirst) {
            if (ctx.yourRole === "defender") {
                return ctx.isYourSupportPickTurn
                    ? "You pick support first."
                    : "Waiting for attacker's support.";
            }
            return ctx.isYourSupportPickTurn
                ? "Pick support after the defender."
                : "Defender picks support first.";
        }
        return "Optional support from hand — or bluff with none.";
    }

    if (ctx.phase === "battle_attack") {
        if (ctx.attackLocked) return "Waiting for opponent's attack.";
        return "Attacker strikes first; defender counter-attacks if they survive.";
    }

    if (ctx.phase === "battle_reveal") {
        return "Support reveal — defender flips first.";
    }

    if (ctx.phase === "resolution") {
        return "Applying damage.";
    }

    return "";
}

/** Center-screen flash only for exceptional moments. */
export function shouldShowFlashMessage(message: string, phase: string): boolean {
    if (phase === "victory") return true;
    const flash =
        /KO|deck out|match over|forfeit|disconnected|double ko/i.test(message);
    return flash;
}

// Legacy exports used by tests
export type BattleRolePhase = Exclude<TurnStatusPhase, "victory">;

export interface BattleRoleContext {
    phase: BattleRolePhase;
    yourRole: BattleRole;
    supportPickDefenderFirst: boolean;
    attackLockBeforeSupport: boolean;
    isYourSupportPickTurn: boolean;
    attackLocked: boolean;
}

export function getBattleRoleHeadline(ctx: BattleRoleContext): string {
    return getTurnStatusTitle({
        phase: ctx.phase,
        prepSubPhase: "",
        yourRole: ctx.yourRole,
        isYourTurn: ctx.yourRole === "attacker",
        supportPickDefenderFirst: ctx.supportPickDefenderFirst,
        isYourSupportPickTurn: ctx.isYourSupportPickTurn,
        attackLocked: ctx.attackLocked,
    });
}

export function getBattleRoleSubline(ctx: BattleRoleContext): string {
    return getTurnStatusHint({
        phase: ctx.phase,
        prepSubPhase: "",
        yourRole: ctx.yourRole,
        isYourTurn: true,
        supportPickDefenderFirst: ctx.supportPickDefenderFirst,
        isYourSupportPickTurn: ctx.isYourSupportPickTurn,
        attackLocked: ctx.attackLocked,
    });
}
