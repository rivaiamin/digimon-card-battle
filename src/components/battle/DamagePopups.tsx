import React from "react";
import { motion, AnimatePresence } from "motion/react";
import type { DamagePopup } from "../../hooks/useBattleVfx";

const ANCHOR: Record<DamagePopup["target"], string> = {
  opponent: "left-[58%] top-[32%]",
  player: "left-[42%] top-[52%]",
};

export const DamagePopups: React.FC<{ popups: DamagePopup[] }> = ({ popups }) => (
  <motion.div
    className="fixed inset-0 z-[90] pointer-events-none overflow-hidden"
    aria-hidden
  >
    <AnimatePresence>
      {popups.map((popup) => (
        <motion.div
          key={popup.id}
          className={`absolute ${ANCHOR[popup.target]} -translate-x-1/2`}
          initial={{ opacity: 0, y: 24, scale: 0.45 }}
          animate={{
            opacity: [0, 1, 1, 0],
            y: [24, 0, -36, -64],
            scale: popup.isHeavy ? [0.45, 1.35, 1.05, 0.85] : [0.45, 1.2, 1, 0.8],
          }}
          transition={{ duration: 1.35, ease: "easeOut", times: [0, 0.15, 0.7, 1] }}
        >
          <span
            className={`block font-black italic tracking-tighter drop-shadow-[0_0_12px_rgba(255,60,60,0.9)] skew-x-[-12deg] ${
              popup.isHeavy ? "text-7xl text-ps-yellow" : "text-5xl text-fg"
            }`}
          >
            -{popup.amount}
          </span>
        </motion.div>
      ))}
    </AnimatePresence>
  </motion.div>
);
