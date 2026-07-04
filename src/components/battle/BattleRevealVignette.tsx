import React from "react";
import { motion, AnimatePresence } from "motion/react";

type BattleRevealVignetteProps = {
    visible: boolean;
    label?: string;
};

export const BattleRevealVignette: React.FC<BattleRevealVignetteProps> = ({
    visible,
    label = "SUPPORT REVEAL",
}) => (
    <AnimatePresence>
        {visible && (
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25 }}
                className="fixed inset-0 z-[82] pointer-events-none reveal-vignette"
            >
                <motion.div
                    initial={{ y: -40, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -20, opacity: 0 }}
                    className="absolute top-[12%] left-1/2 -translate-x-1/2"
                >
                    <div className="bg-black/80 border-2 border-white/60 px-12 py-2 skew-x-[-18deg] shadow-[0_0_30px_rgba(60,155,255,0.4)]">
                        <span className="block skew-x-[18deg] text-2xl font-black italic text-white tracking-[0.2em]">
                            {label}
                        </span>
                    </div>
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
);
