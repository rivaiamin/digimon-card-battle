import React from "react";
import { motion, AnimatePresence } from "motion/react";
import type { MulliganOverlayMode } from "../../hooks/useMulliganBeat";

type HandMulliganStatusProps = {
    visible: boolean;
    mode: MulliganOverlayMode;
    mulligansRemaining: number;
    cardsLanded: number;
};

export const HandMulliganStatus: React.FC<HandMulliganStatusProps> = ({
    visible,
    mode,
    mulligansRemaining,
    cardsLanded,
}) => {
    const label = (() => {
        switch (mode) {
            case "opponent":
                return "Opponent reviewing hand";
            case "redrawing":
                return "Redrawing…";
            case "landed":
                return cardsLanded === 1 ? "New hand · 1 card" : `New hand · ${cardsLanded} cards`;
            case "choose":
                return mulligansRemaining > 0
                    ? `Keep or redraw (${mulligansRemaining} left)`
                    : "Keep hand to continue";
            default:
                return "";
        }
    })();

    return (
        <AnimatePresence>
            {visible && mode !== "idle" && label && (
                <motion.span
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    transition={{ duration: 0.2 }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide whitespace-nowrap ${
                        mode === "landed"
                            ? "border-ps-green/45 bg-ps-green/10 text-ps-green"
                            : mode === "redrawing"
                              ? "border-ps-yellow/45 bg-ps-yellow/10 text-ps-yellow"
                              : mode === "opponent"
                                ? "border-line bg-fg/5 text-muted"
                                : "border-ps-blue/40 bg-ps-blue/10 text-ps-blue"
                    }`}
                >
                    {mode === "redrawing" && (
                        <motion.span
                            className="inline-block h-1.5 w-1.5 rounded-full bg-ps-yellow"
                            animate={{ opacity: [0.35, 1, 0.35] }}
                            transition={{ duration: 0.7, repeat: Infinity }}
                            aria-hidden
                        />
                    )}
                    {label}
                </motion.span>
            )}
        </AnimatePresence>
    );
};
