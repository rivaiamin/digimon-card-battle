import React from "react";
import { motion } from "motion/react";
import { DigimonCard } from "../Card";
import type { DigimonCardData } from "../../types";

type SupportZoneProps = {
    side: "player" | "opponent";
    phase: string;
    supportCard: DigimonCardData | null;
    supportLocked: boolean;
    /** Client-only face-down preview after locking (before server reveal). */
    committedFaceDown?: DigimonCardData | null;
    onHover?: (data: DigimonCardData | null) => void;
};

export const SupportZone: React.FC<SupportZoneProps> = ({
    side,
    phase,
    supportCard,
    supportLocked,
    committedFaceDown,
    onHover,
}) => {
    const isReveal = phase === "battle_reveal";
    const isSupportPhase = phase === "battle_support";
    const showFaceDown =
        isSupportPhase && supportLocked && !supportCard && committedFaceDown;
    const showRevealed = !!supportCard && (isReveal || phase === "battle_attack" || phase === "resolution");
    const showOpponentBack = side === "opponent" && isSupportPhase && supportLocked && !supportCard;

    if (!showFaceDown && !showRevealed && !showOpponentBack) return null;

    const positionClass =
        side === "player" ? "absolute -right-32 top-0" : "absolute -left-32 top-0";

    return (
        <motion.div
            className={`${positionClass} z-20`}
            initial={false}
            animate={{
                scale: isReveal ? [0.75, 1.05, 1] : 0.75,
                rotateY: showFaceDown || showOpponentBack ? 180 : 0,
                opacity: showRevealed ? 1 : 0.85,
            }}
            transition={{
                duration: isReveal ? 0.55 : 0.35,
                ease: "easeOut",
            }}
            style={{ transformStyle: "preserve-3d", perspective: 800 }}
        >
            {showRevealed && supportCard && (
                <>
                    <motion.div
                        className="absolute -inset-4 rounded-full blur-xl opacity-40 pointer-events-none"
                        style={{
                            background:
                                side === "player"
                                    ? "radial-gradient(circle, rgba(60,155,255,0.7) 0%, transparent 70%)"
                                    : "radial-gradient(circle, rgba(255,60,60,0.6) 0%, transparent 70%)",
                        }}
                        initial={{ opacity: 0, scale: 0.5 }}
                        animate={{ opacity: [0, 0.6, 0.35], scale: [0.5, 1.2, 1] }}
                        transition={{ duration: 0.8 }}
                    />
                    <DigimonCard
                        data={supportCard}
                        variant="mini"
                        isOpponent={side === "opponent"}
                        onHover={onHover}
                    />
                </>
            )}

            {(showFaceDown && committedFaceDown) && (
                <motion.div
                    className="relative rotate-12"
                    initial={{ y: 24, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                >
                    <div className="w-[72px] h-[100px] rounded border-2 border-ps-blue/60 bg-gradient-to-br from-slate-900 via-indigo-950 to-black shadow-[0_0_20px_rgba(60,155,255,0.35)] flex items-center justify-center">
                        <span className="text-[8px] font-black text-ps-blue/80 uppercase tracking-widest rotate-180">
                            Support
                        </span>
                    </div>
                </motion.div>
            )}

            {showOpponentBack && (
                <div className="w-[72px] h-[100px] rounded border-2 border-ps-red/50 bg-gradient-to-br from-slate-900 via-red-950/40 to-black shadow-[0_0_16px_rgba(255,60,60,0.25)] flex items-center justify-center -rotate-12">
                    <span className="text-[8px] font-black text-ps-red/70 uppercase tracking-widest">???</span>
                </div>
            )}
        </motion.div>
    );
};
