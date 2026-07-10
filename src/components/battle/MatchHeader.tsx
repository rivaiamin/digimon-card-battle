import React, { useEffect, useState } from "react";
import { Swords, Shield } from "lucide-react";
import {
    getBattleRole,
    getOpponentBattleRole,
    getTurnStatusHint,
    getTurnStatusTitle,
    type BattleRole,
    type TurnStatusPhase,
} from "../../lib/battleRoles";

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
    playerScore: number;
    opponentScore: number;
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

function RolePill({ role }: { role: BattleRole }) {
    const isAttacker = role === "attacker";
    const Icon = isAttacker ? Swords : Shield;
    return (
        <span
            className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                isAttacker
                    ? "bg-ps-yellow/15 text-ps-yellow border border-ps-yellow/30"
                    : "bg-ps-blue/10 text-ps-blue border border-ps-blue/25"
            }`}
        >
            <Icon className="h-3 w-3" aria-hidden />
            {isAttacker ? "Attacker" : "Defender"}
        </span>
    );
}

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
    playerScore,
    opponentScore,
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

    const title = getTurnStatusTitle({
        phase: battlePhase,
        prepSubPhase: prep,
        yourRole,
        isYourTurn,
        supportPickDefenderFirst,
        isYourSupportPickTurn: supportPickSessionId === yourSessionId,
        attackLocked,
        handTarget,
        mulligansRemaining,
    });
    const hint = getTurnStatusHint({
        phase: battlePhase,
        prepSubPhase: prep,
        yourRole,
        isYourTurn,
        supportPickDefenderFirst,
        isYourSupportPickTurn: supportPickSessionId === yourSessionId,
        attackLocked,
        handTarget,
        mulligansRemaining,
    });

    const timerCritical = remainingSec !== null && remainingSec <= 5;

    return (
        <header className="fixed top-0 inset-x-0 z-[100] pointer-events-none">
            <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 pt-3 pb-2 bg-gradient-to-b from-app via-app/95 to-transparent">
                <div className="flex items-center gap-6">
                    <ScorePips score={playerScore} color="ps-blue" />
                    <span className="text-xs font-semibold text-muted">vs</span>
                    <ScorePips score={opponentScore} color="ps-red" />
                </div>

                <div
                    className={`w-full max-w-2xl rounded border px-4 py-2 text-center shadow-sm bg-surface-strong/95 ${
                        timerCritical ? "border-ps-red/50" : "border-line"
                    }`}
                >
                    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm font-semibold text-fg">
                        <span className="text-muted tabular-nums">Turn {turn}</span>
                        <span className="text-muted">·</span>
                        <span>{title}</span>
                        {remainingSec !== null && (
                            <>
                                <span className="text-muted">·</span>
                                <span
                                    className={`tabular-nums ${timerCritical ? "text-ps-red" : "text-muted"}`}
                                >
                                    {remainingSec}s
                                </span>
                            </>
                        )}
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center justify-center gap-2">
                        <span className="text-[11px] text-muted">You</span>
                        <RolePill role={yourRole} />
                        <span className="text-[11px] text-muted">Opponent</span>
                        <RolePill role={getOpponentBattleRole(yourRole)} />
                    </div>
                    {hint && (
                        <p className="mt-1.5 text-xs text-muted leading-snug text-balance">{hint}</p>
                    )}
                </div>
            </div>
        </header>
    );
};

function ScorePips({ score, color }: { score: number; color: "ps-blue" | "ps-red" }) {
    const fill = color === "ps-blue" ? "bg-ps-blue border-fg" : "bg-ps-red border-fg";
    const empty =
        color === "ps-blue" ? "bg-transparent border-ps-blue/40" : "bg-transparent border-ps-red/40";
    return (
        <div className="flex gap-1.5" aria-label={`Score ${score}`}>
            {[0, 1, 2].map(i => (
                <div
                    key={i}
                    className={`h-3 w-3 rotate-45 border-2 ${i < score ? fill : empty}`}
                />
            ))}
        </div>
    );
}
