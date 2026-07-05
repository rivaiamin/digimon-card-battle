/**
 * Attacker / defender labeling for UI (FC-003 / FC-012).
 */

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
}

/** One-line phase title for the match header. */
export function getTurnStatusTitle(ctx: TurnStatusContext): string {
    const role = formatBattleRoleLabel(ctx.yourRole);

    if (ctx.phase === "draw") {
        return ctx.isYourTurn ? `Turn · Draw (${role})` : `Waiting · opponent draws (${role})`;
    }

    if (ctx.phase === "preparation") {
        if (!ctx.isYourTurn) {
            return `Waiting · opponent prepares (${role})`;
        }
        switch (ctx.prepSubPhase) {
            case "mulligan":
                return `Opening hand (${ctx.handTarget ?? 4} cards)`;
            case "deploy":
                return "Deploy your Digimon";
            case "discard":
                return "Discard for DP";
            case "evolve":
                return "Evolve or end prep";
            default:
                return `Preparation (${role})`;
        }
    }

    if (ctx.phase === "battle_support") {
        return `Battle · Support (${role})`;
    }
    if (ctx.phase === "battle_reveal") {
        return `Battle · Reveal (${role})`;
    }
    if (ctx.phase === "battle_attack") {
        return `Battle · Choose attack (${role})`;
    }
    if (ctx.phase === "resolution") {
        return "Resolving battle";
    }
    if (ctx.phase === "victory") {
        return "Match over";
    }

    return `Turn · ${role}`;
}

/** Short action hint; empty when nothing useful to say. */
export function getTurnStatusHint(ctx: TurnStatusContext): string {
    if (ctx.phase === "draw") {
        return ctx.isYourTurn ? "Drawing to hand size." : "";
    }

    if (ctx.phase === "preparation") {
        if (!ctx.isYourTurn) return "";
        switch (ctx.prepSubPhase) {
            case "mulligan":
                return "Keep this hand or mulligan once.";
            case "deploy":
                return "Play a Digimon from your hand.";
            case "discard":
                return "Discard Digimon cards to gain DP.";
            case "evolve":
                return "Evolve if you can, then end prep.";
            default:
                return "";
        }
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
        return "Optional support from hand.";
    }

    if (ctx.phase === "battle_attack") {
        if (ctx.attackLocked) return "Waiting for opponent's attack.";
        return "Attacker strikes first; defender counter-attacks if they survive.";
    }

    if (ctx.phase === "battle_reveal") {
        return "Cards are revealing.";
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
