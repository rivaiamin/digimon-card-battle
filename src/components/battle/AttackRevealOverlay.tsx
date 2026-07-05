import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Circle, Triangle, X as CrossIcon } from "lucide-react";

type AttackType = "circle" | "triangle" | "cross";

const ATTACK_META: Record<
    AttackType,
    { label: string; icon: React.ReactNode; color: string; border: string }
> = {
    circle: {
        label: "CIRCLE",
        icon: <Circle className="w-10 h-10" strokeWidth={3} />,
        color: "text-ps-blue",
        border: "border-ps-blue",
    },
    triangle: {
        label: "TRIANGLE",
        icon: <Triangle className="w-10 h-10" strokeWidth={3} />,
        color: "text-ps-yellow",
        border: "border-ps-yellow",
    },
    cross: {
        label: "CROSS",
        icon: <CrossIcon className="w-10 h-10" strokeWidth={3} />,
        color: "text-ps-red",
        border: "border-ps-red",
    },
};

type AttackRevealOverlayProps = {
    visible: boolean;
    playerAttack: AttackType | null;
    opponentAttack: AttackType | null;
};

function AttackBadge({
    attack,
    side,
}: {
    attack: AttackType;
    side: "player" | "opponent";
}) {
    const meta = ATTACK_META[attack];
    const fromX = side === "player" ? -120 : 120;

    return (
        <motion.div
            initial={{ x: fromX, opacity: 0, rotateY: 90 }}
            animate={{ x: 0, opacity: 1, rotateY: 0 }}
            transition={{ type: "spring", stiffness: 280, damping: 22 }}
            className={`flex flex-col items-center gap-2 px-8 py-4 bg-surface-strong border-4 ${meta.border} skew-x-[-12deg] shadow-[0_0_40px_rgba(60,155,255,0.15)]`}
        >
            <div className={`skew-x-[12deg] ${meta.color}`}>{meta.icon}</div>
            <span className={`skew-x-[12deg] text-lg font-black italic tracking-tighter ${meta.color}`}>
                {meta.label}
            </span>
        </motion.div>
    );
}

export const AttackRevealOverlay: React.FC<AttackRevealOverlayProps> = ({
    visible,
    playerAttack,
    opponentAttack,
}) => {
    const show = visible && playerAttack && opponentAttack;

    return (
        <AnimatePresence>
            {show && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    className="fixed inset-0 z-[90] pointer-events-none flex flex-col items-center justify-center gap-6"
                >
                    <motion.div
                        initial={{ scale: 2, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={{ delay: 0.05, type: "spring", stiffness: 200 }}
                        className="bg-ps-yellow px-10 py-2 border-y-4 border-fg skew-x-[-15deg] mb-4"
                    >
                        <span className="block skew-x-[15deg] text-3xl font-black italic text-black tracking-tighter">
                            ATTACK LOCK REVEALED
                        </span>
                    </motion.div>

                    <div className="flex items-center gap-8">
                        <AttackBadge attack={playerAttack} side="player" />
                        <motion.span
                            initial={{ scale: 0 }}
                            animate={{ scale: [0, 1.4, 1] }}
                            transition={{ delay: 0.15, duration: 0.35 }}
                            className="text-5xl font-black italic text-fg drop-shadow-[0_0_20px_rgba(60,155,255,0.35)]"
                        >
                            VS
                        </motion.span>
                        <AttackBadge attack={opponentAttack} side="opponent" />
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
