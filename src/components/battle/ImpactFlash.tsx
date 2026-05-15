import React from "react";
import { motion, AnimatePresence } from "motion/react";

type ImpactFlashProps = {
  color: string | null;
};

export const ImpactFlash: React.FC<ImpactFlashProps> = ({ color }) => (
  <AnimatePresence>
    {color && (
      <motion.div
        key={color}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.05 }}
        className="fixed inset-0 z-[85] pointer-events-none mix-blend-screen"
        style={{ backgroundColor: color }}
      />
    )}
  </AnimatePresence>
);
