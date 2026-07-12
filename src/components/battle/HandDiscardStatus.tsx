import React from "react";
import { motion, AnimatePresence } from "motion/react";

type HandDiscardStatusProps = {
    visible: boolean;
    playerDp: number;
    lastDpGain: number;
    isYourTurn: boolean;
};

export const HandDiscardStatus: React.FC<HandDiscardStatusProps> = ({
    visible,
    playerDp,
    lastDpGain,
    isYourTurn,
}) => (
    <AnimatePresence>
        {visible && (
            <motion.span
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -4 }}
                transition={{ duration: 0.2 }}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide whitespace-nowrap ${
                    lastDpGain > 0
                        ? "border-ps-green/45 bg-ps-green/10 text-ps-green"
                        : "border-ps-yellow/40 bg-ps-yellow/10 text-ps-yellow"
                }`}
                title={
                    lastDpGain > 0
                        ? `Gained ${lastDpGain} DP`
                        : isYourTurn
                          ? `Discard Digimon for DP · ${playerDp} DP`
                          : "Opponent discarding"
                }
            >
                {lastDpGain > 0 ? (
                    <>+{lastDpGain} DP</>
                ) : isYourTurn ? (
                    <>{playerDp} DP</>
                ) : (
                    <>Opp.</>
                )}
            </motion.span>
        )}
    </AnimatePresence>
);
