import React from "react";
import { motion } from "motion/react";
import { DigimonCard } from "../Card";
import type { DigimonCardData } from "../../types";
import { SUPPORT_REVEAL_STAGGER_S } from "../../lib/battleTurnFlow";

type SupportZoneProps = {
    side: "player" | "opponent";
    phase: string;
    supportCard: DigimonCardData | null;
    supportLocked: boolean;
    /** Client-only face-down preview after locking a real card (before server reveal). */
    committedFaceDown?: DigimonCardData | null;
    /** Player locked with NO SUPPORT — still show a bluff face-down (GDD / P3-6). */
    bluffEmpty?: boolean;
    /** Player gambled the Online Deck top card (FC-013) — face-down until reveal. */
    bluffGamble?: boolean;
    /** Staggered flip order during battle_reveal (defender reveals first). */
    revealOrder?: "first" | "second" | null;
    onHover?: (data: DigimonCardData | null) => void;
};

function FaceDownBluff({
    side,
    label,
}: {
    side: "player" | "opponent";
    label: string;
}) {
    const isPlayer = side === "player";
    return (
        <motion.div
            className={`relative ${isPlayer ? "rotate-12" : "-rotate-12"}`}
            initial={{ y: 24, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ opacity: 0, scale: 0.85 }}
        >
            <div
                className={`w-[72px] h-[100px] rounded border-2 bg-panel flex items-center justify-center ${
                    isPlayer
                        ? "border-ps-blue/60 shadow-[0_0_20px_rgba(60,155,255,0.35)]"
                        : "border-ps-red/50 shadow-[0_0_16px_rgba(255,60,60,0.25)]"
                }`}
            >
                <span
                    className={`text-xs font-black uppercase tracking-widest ${
                        isPlayer ? "text-ps-blue rotate-180" : "text-ps-red"
                    }`}
                >
                    {label}
                </span>
            </div>
        </motion.div>
    );
}

export const SupportZone: React.FC<SupportZoneProps> = ({
    side,
    phase,
    supportCard,
    supportLocked,
    committedFaceDown,
    bluffEmpty = false,
    bluffGamble = false,
    revealOrder = null,
    onHover,
}) => {
    const isReveal = phase === "battle_reveal";
    const revealDelay = isReveal && revealOrder === "second" ? SUPPORT_REVEAL_STAGGER_S : 0;
    const isSupportPhase = phase === "battle_support";
    const showFaceDown =
        isSupportPhase && supportLocked && !supportCard && !!committedFaceDown;
    const showGambleBluff =
        isSupportPhase && supportLocked && !supportCard && !committedFaceDown && bluffGamble;
    const showEmptyBluff =
        isSupportPhase &&
        supportLocked &&
        !supportCard &&
        !committedFaceDown &&
        !bluffGamble &&
        bluffEmpty;
    const showRevealed = !!supportCard && (isReveal || phase === "battle_attack" || phase === "resolution");
    const showOpponentBack =
        side === "opponent" && isSupportPhase && supportLocked && !supportCard;
    const showEmptyReveal =
        isReveal && supportLocked && !supportCard && (side === "player" ? bluffEmpty : true);

    if (
        !showFaceDown &&
        !showRevealed &&
        !showOpponentBack &&
        !showEmptyBluff &&
        !showGambleBluff &&
        !showEmptyReveal
    ) {
        return null;
    }

    const positionClass =
        side === "player" ? "absolute -right-32 top-0" : "absolute -left-32 top-0";

    return (
        <motion.div
            className={`${positionClass} z-20`}
            initial={false}
            animate={{
                scale: isReveal ? [0.6, 1.12, 1] : showRevealed ? 0.85 : 0.75,
                rotateY: isReveal && showRevealed
                    ? [180, -8, 0]
                    : showFaceDown || showOpponentBack || showEmptyBluff || showGambleBluff
                      ? 180
                      : 0,
                opacity: showRevealed || showEmptyReveal ? 1 : 0.85,
                y: isReveal && (showRevealed || showEmptyReveal) ? [24, -6, 0] : 0,
            }}
            transition={{
                duration: isReveal ? 0.65 : 0.35,
                delay: revealDelay,
                ease: isReveal ? [0.22, 1, 0.36, 1] : "easeOut",
            }}
            style={{ transformStyle: "preserve-3d", perspective: 900 }}
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
                        animate={
                            isReveal
                                ? { opacity: [0, 0.85, 0.45], scale: [0.4, 1.35, 1] }
                                : { opacity: [0, 0.6, 0.35], scale: [0.5, 1.2, 1] }
                        }
                        transition={{ duration: isReveal ? 0.9 : 0.8, delay: revealDelay }}
                    />
                    <motion.div
                        animate={
                            isReveal
                                ? { rotateZ: [12, -4, 0] }
                                : { rotateZ: side === "player" ? 12 : -12 }
                        }
                        transition={{ duration: 0.55, delay: revealDelay }}
                    >
                        <DigimonCard
                            data={supportCard}
                            variant="mini"
                            isOpponent={side === "opponent"}
                            onHover={onHover}
                        />
                    </motion.div>
                </>
            )}

            {showFaceDown && committedFaceDown && (
                <FaceDownBluff side={side} label="Support" />
            )}

            {showGambleBluff && <FaceDownBluff side={side} label="Deck" />}

            {(showEmptyBluff || (showOpponentBack && !committedFaceDown && !bluffGamble)) &&
                !showEmptyReveal && (
                <FaceDownBluff side={side} label={side === "opponent" ? "???" : "Bluff"} />
            )}

            {showEmptyReveal && (
                <motion.div
                    className={`w-[72px] h-[100px] rounded border border-dashed border-line/60 bg-panel/40 flex items-center justify-center ${
                        side === "player" ? "rotate-12" : "-rotate-12"
                    }`}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: [0, 1, 0.7], scale: [0.8, 1.05, 1] }}
                    transition={{ duration: 0.55, delay: revealDelay }}
                >
                    <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                        None
                    </span>
                </motion.div>
            )}
        </motion.div>
    );
};
