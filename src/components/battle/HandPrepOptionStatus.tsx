import React from "react";
import { motion, AnimatePresence } from "motion/react";

type HandPrepOptionStatusProps = {
    visible: boolean;
    feedback: string | null;
    isYourTurn: boolean;
};

export const HandPrepOptionStatus: React.FC<HandPrepOptionStatusProps> = ({
    visible,
    feedback,
    isYourTurn,
}) => {
    const label = feedback
        ? feedback
        : isYourTurn
          ? "Prep options"
          : "Opp. prep";

    return (
        <AnimatePresence>
            {visible && (
                <motion.span
                    initial={{ opacity: 0, x: -6 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -4 }}
                    transition={{ duration: 0.2 }}
                    title={
                        feedback
                            ? feedback
                            : isYourTurn
                              ? "Tap yellow prep option badges on hand cards"
                              : "Opponent using prep options"
                    }
                    className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide whitespace-nowrap ${
                        feedback
                            ? "border-ps-green/45 bg-ps-green/10 text-ps-green"
                            : "border-ps-yellow/40 bg-ps-yellow/10 text-ps-yellow"
                    }`}
                >
                    {label}
                </motion.span>
            )}
        </AnimatePresence>
    );
};
