import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Circle, Triangle, X as CrossIcon } from "lucide-react";
import type { CombatStrike } from "../../lib/combatStrikePlan";

type AttackType = "circle" | "triangle" | "cross";

const ATTACK_META: Record<
    AttackType,
    { icon: React.ReactNode; color: string; border: string }
> = {
    circle: {
        icon: <Circle className="w-8 h-8" strokeWidth={3} />,
        color: "text-ps-blue",
        border: "border-ps-blue",
    },
    triangle: {
        icon: <Triangle className="w-8 h-8" strokeWidth={3} />,
        color: "text-ps-yellow",
        border: "border-ps-yellow",
    },
    cross: {
        icon: <CrossIcon className="w-8 h-8" strokeWidth={3} />,
        color: "text-ps-red",
        border: "border-ps-red",
    },
};

type AttackStrikePanelProps = {
    strike: CombatStrike | null;
    side: "player" | "opponent";
    visible: boolean;
};

export const AttackStrikePanel: React.FC<AttackStrikePanelProps> = ({
    strike,
    side,
    visible,
}) => {
    if (!strike) return null;
    const meta = ATTACK_META[strike.attack];
    const fromX = side === "player" ? -48 : 48;

    return (
        <AnimatePresence>
            {visible && (
                <motion.div
                    initial={{ x: fromX, opacity: 0 }}
                    animate={{ x: side === "player" ? -16 : 16, opacity: 1 }}
                    exit={{ x: fromX, opacity: 0 }}
                    transition={{ type: "spring", stiffness: 320, damping: 24, duration: 0.7 }}
                    className={`absolute top-1/2 -translate-y-1/2 z-20 pointer-events-none
                        ${side === "player" ? "left-full ml-4" : "right-full mr-4"}`}
                >
                    <div
                        className={`bg-surface-strong border-4 ${meta.border} px-5 py-4 min-w-[160px] shadow-[0_0_30px_rgba(60,155,255,0.2)] skew-x-[-10deg]`}
                    >
                        <div className="skew-x-[10deg] flex flex-col gap-2">
                            <div className={`flex items-center gap-2 ${meta.color}`}>
                                {meta.icon}
                                <span className="text-xs font-black uppercase tracking-wider">
                                    {strike.attack.toUpperCase()}
                                </span>
                            </div>
                            <span className="text-sm font-bold text-white uppercase leading-tight">
                                {strike.attackName}
                            </span>
                            <div className="h-px bg-line" />
                            <div className="flex flex-col gap-0.5 tabular-nums">
                                <div className="flex justify-between text-xs">
                                    <span className="text-muted uppercase">Base</span>
                                    <span className="font-bold text-white">{strike.baseDamage}</span>
                                </div>
                                {strike.bonusDamage !== 0 && (
                                    <div className="flex justify-between text-xs">
                                        <span className="text-muted uppercase">Bonus</span>
                                        <span className="font-bold text-ps-yellow">
                                            {strike.bonusDamage > 0 ? "+" : ""}
                                            {strike.bonusDamage}
                                        </span>
                                    </div>
                                )}
                                <div className="flex justify-between text-sm mt-1">
                                    <span className="text-muted uppercase font-bold">Total</span>
                                    <span className={`font-black italic ${meta.color}`}>
                                        {strike.totalDamage}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
