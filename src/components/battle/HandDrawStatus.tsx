import React from "react";
import { motion, AnimatePresence } from "motion/react";
import type { DrawOverlayMode } from "../../hooks/useDrawPhaseBeat";

type HandDrawStatusProps = {
    visible: boolean;
    mode: DrawOverlayMode;
    handTarget: number;
    cardsLanded: number;
};

export const HandDrawStatus: React.FC<HandDrawStatusProps> = ({
    visible,
    mode,
    handTarget,
    cardsLanded,
}) => {
    const label =
        mode === "opponent"
            ? "Opponent drawing"
            : mode === "landing"
              ? cardsLanded === 1
                  ? "+1 drawn"
                  : `+${cardsLanded} drawn`
              : `Drawing to ${handTarget}…`;

    return (
        <AnimatePresence>
            {visible && mode !== "idle" && (
                <motion.span
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    transition={{ duration: 0.2 }}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide whitespace-nowrap ${
                        mode === "landing"
                            ? "border-ps-green/45 bg-ps-green/10 text-ps-green"
                            : mode === "opponent"
                              ? "border-line bg-fg/5 text-muted"
                              : "border-ps-blue/40 bg-ps-blue/10 text-ps-blue"
                    }`}
                >
                    {mode === "drawing" && (
                        <motion.span
                            className="inline-block h-1.5 w-1.5 rounded-full bg-ps-blue"
                            animate={{ opacity: [0.35, 1, 0.35] }}
                            transition={{ duration: 0.8, repeat: Infinity }}
                            aria-hidden
                        />
                    )}
                    {label}
                </motion.span>
            )}
        </AnimatePresence>
    );
};
