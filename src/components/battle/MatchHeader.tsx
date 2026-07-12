import React, { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
    getBattleRole,
    getTurnStatusHint,
    getTurnStatusTitle,
    type TurnStatusPhase,
} from "../../lib/battleRoles";
import { PREP_SUBPHASE_TRANSITION_MS } from "../../lib/prepPhaseCopy";

type Props = {
    turn: number;
    phase: string;
    prepSubPhase: string;
    isYourTurn: boolean;
    yourSessionId: string;
    activePlayerSessionId: string;
    supportPickDefenderFirst: boolean;
    supportPickSessionId: string;
    attackLocked: boolean;
    phaseEndsAtMs: number;
    handTarget: number;
    mulligansRemaining: number;
    needsOpeningDeploy?: boolean;
    /** When true, sit on the play-field midpoint (hand-aware) */
    fieldAnchored?: boolean;
};

function toPhase(phase: string): TurnStatusPhase {
    if (
        phase === "draw" ||
        phase === "preparation" ||
        phase === "battle_support" ||
        phase === "battle_reveal" ||
        phase === "battle_attack" ||
        phase === "resolution" ||
        phase === "victory"
    ) {
        return phase;
    }
    return "other";
}

/** Slim center strip: turn · phase · timer only (score/role live on seat plaques). */
export const MatchHeader: React.FC<Props> = ({
    turn,
    phase,
    prepSubPhase,
    isYourTurn,
    yourSessionId,
    activePlayerSessionId,
    supportPickDefenderFirst,
    supportPickSessionId,
    attackLocked,
    phaseEndsAtMs,
    handTarget,
    mulligansRemaining,
    needsOpeningDeploy = false,
    fieldAnchored = false,
}) => {
    const [remainingSec, setRemainingSec] = useState<number | null>(null);

    useEffect(() => {
        if (!phaseEndsAtMs || phaseEndsAtMs <= 0) {
            setRemainingSec(null);
            return;
        }
        const tick = () => {
            const ms = Math.max(0, phaseEndsAtMs - Date.now());
            setRemainingSec(Math.ceil(ms / 1000));
        };
        tick();
        const id = window.setInterval(tick, 250);
        return () => window.clearInterval(id);
    }, [phaseEndsAtMs, phase]);

    if (!activePlayerSessionId || phase === "waiting") {
        return null;
    }

    const battlePhase = toPhase(phase);
    const yourRole = getBattleRole(yourSessionId, activePlayerSessionId);
    const prep =
        prepSubPhase === "mulligan" ||
        prepSubPhase === "deploy" ||
        prepSubPhase === "discard" ||
        prepSubPhase === "evolve"
            ? prepSubPhase
            : "";

    const statusCtx = {
        phase: battlePhase,
        prepSubPhase: prep,
        yourRole,
        isYourTurn,
        supportPickDefenderFirst,
        isYourSupportPickTurn: supportPickSessionId === yourSessionId,
        attackLocked,
        handTarget,
        mulligansRemaining,
        needsOpeningDeploy,
    } as const;

    const title = getTurnStatusTitle(statusCtx);
    const hint = getTurnStatusHint(statusCtx);
    const statusKey = `${phase}:${prep}:${isYourTurn ? "you" : "opp"}`;
    const timerCritical = remainingSec !== null && remainingSec <= 5;
    const transitionSec = PREP_SUBPHASE_TRANSITION_MS / 1000;

    // Hand dock / seat carry phase instructions — keep center strip one line.
    const showHint =
        !!hint &&
        prep !== "mulligan" &&
        prep !== "deploy" &&
        prep !== "discard" &&
        prep !== "evolve" &&
        phase !== "battle_attack" &&
        phase !== "battle_support";

    return (
        <header
            className={`fixed inset-x-0 z-[100] -translate-y-1/2 pointer-events-none px-3 transition-[top] duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
                fieldAnchored
                    ? "match-header--field top-[var(--play-mid)]"
                    : "top-[28%] sm:top-[30%]"
            }`}
        >
            <div className="mx-auto flex max-w-sm flex-col items-center">
                <div
                    className={`w-full rounded-xl px-2.5 sm:px-3 py-1 sm:py-1.5 text-center bg-surface-strong/95 ring-1 backdrop-blur-md ${
                        timerCritical ? "ring-ps-red/50" : "ring-line"
                    }`}
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={statusKey}
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: 3 }}
                            transition={{ duration: transitionSec * 0.7, ease: [0.32, 0.72, 0, 1] }}
                        >
                            <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5">
                                <span className="text-xs sm:text-sm font-semibold text-muted tabular-nums">
                                    Turn {turn}
                                </span>
                                <span className="text-muted">·</span>
                                <span className="text-xs sm:text-sm font-semibold text-fg">{title}</span>
                                {remainingSec !== null && (
                                    <>
                                        <span className="text-muted">·</span>
                                        <span
                                            className={`text-xs sm:text-sm font-semibold tabular-nums ${
                                                timerCritical ? "text-ps-red" : "text-muted"
                                            }`}
                                        >
                                            {remainingSec}s
                                        </span>
                                    </>
                                )}
                            </div>
                            {showHint && (
                                <p className="mt-0.5 text-[10px] sm:text-[11px] text-muted leading-snug text-balance">
                                    {hint}
                                </p>
                            )}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </header>
    );
};
