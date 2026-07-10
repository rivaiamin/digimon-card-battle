import React from "react";
import { motion, AnimatePresence } from "motion/react";
import type { EvolutionSide } from "../../hooks/useEvolutionVfx";

type EvolutionBeatProps = {
    side: EvolutionSide | null;
};

export const EvolutionBeat: React.FC<EvolutionBeatProps> = ({ side }) => (
    <AnimatePresence>
        {side && (
            <motion.div
                key={side}
                initial={{ scale: 1.2, opacity: 0, y: 12 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.92, opacity: 0, y: -8 }}
                transition={{ duration: 0.32, ease: "easeOut" }}
                className="fixed top-[14%] left-0 w-full z-[88] pointer-events-none flex justify-center"
            >
                <motion.div
                    animate={{ boxShadow: ["0 0 24px rgba(255,220,100,0.4)", "0 0 48px rgba(255,220,100,0.75)", "0 0 24px rgba(255,220,100,0.4)"] }}
                    transition={{ duration: 0.45, repeat: 1, repeatType: "reverse" }}
                    className="bg-ps-yellow border-y-4 border-fg px-14 py-2 skew-x-[-18deg] shadow-[0_0_40px_rgba(255,210,80,0.55)]"
                >
                    <span className="block skew-x-[18deg] text-5xl font-black italic text-black tracking-tighter">
                        DIGIVOLVE!
                    </span>
                </motion.div>
            </motion.div>
        )}
    </AnimatePresence>
);
