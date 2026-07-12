import React, { useEffect, useState } from "react";
import { motion } from "motion/react";
import {
    formatLoserReason,
    formatVictoryScore,
    stageVisible,
    victoryBeatStage,
    victoryTitle,
    type LoserReasonKey,
    type VictoryOutcome,
} from "../../lib/victoryPresentation";

type VictoryOverlayProps = {
    outcome: VictoryOutcome;
    playerScore: number;
    opponentScore: number;
    loserReason?: LoserReasonKey | null;
    onReturnToWorldMap: () => void;
};

/**
 * Staged victory beat then return to the home "world map" screen (UX-007).
 */
export const VictoryOverlay: React.FC<VictoryOverlayProps> = ({
    outcome,
    playerScore,
    opponentScore,
    loserReason,
    onReturnToWorldMap,
}) => {
    const [elapsedMs, setElapsedMs] = useState(0);
    const stage = victoryBeatStage(elapsedMs);
    const reasonLabel = formatLoserReason(loserReason);
    const won = outcome === "won";

    useEffect(() => {
        const started = performance.now();
        let raf = 0;
        const tick = (now: number) => {
            setElapsedMs(now - started);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    return (
        <motion.div
            className="fixed inset-0 bg-overlay z-[200] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35 }}
        >
            <div className="absolute inset-0 jrpg-map-bg opacity-30 pointer-events-none" />
            <div className="scanlines opacity-40 pointer-events-none" />

            <motion.div
                className="relative text-center px-6 max-w-lg"
                initial={{ opacity: 0, y: 16, scale: 0.96 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            >
                <div className="mb-3 text-[10px] font-black uppercase tracking-[0.35em] text-muted">
                    Match Complete
                </div>

                {stageVisible(stage, "title") && (
                    <motion.h1
                        className={`text-6xl sm:text-8xl font-black italic mb-4 ${
                            won ? "text-ps-yellow" : "text-ps-red"
                        }`}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.4 }}
                    >
                        {victoryTitle(outcome)}
                    </motion.h1>
                )}

                {stageVisible(stage, "score") && (
                    <motion.div
                        className="text-muted text-sm font-mono mb-2 uppercase tracking-wide"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.35 }}
                    >
                        {formatVictoryScore(playerScore, opponentScore)}
                    </motion.div>
                )}

                {stageVisible(stage, "reason") && reasonLabel ? (
                    <motion.div
                        className="text-muted text-sm font-mono mb-8 uppercase tracking-widest"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.35 }}
                    >
                        {reasonLabel}
                    </motion.div>
                ) : stageVisible(stage, "cta") ? (
                    <div className="mb-8" />
                ) : null}

                {stageVisible(stage, "cta") && (
                    <motion.button
                        type="button"
                        onClick={onReturnToWorldMap}
                        className="bg-ps-yellow text-black px-12 py-4 font-black italic border-4 border-fg hover:bg-surface-strong transition-colors"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.35 }}
                    >
                        RETURN TO WORLD MAP
                    </motion.button>
                )}
            </motion.div>
        </motion.div>
    );
};
