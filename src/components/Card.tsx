import React from "react";
import { motion } from "motion/react";
import { DigimonCardData } from "../types";
import { Circle, Triangle, X } from "lucide-react";

interface CardProps {
  data: DigimonCardData;
  isOpponent?: boolean;
  isAttacking?: boolean;
  delay?: number;
}

export const DigimonCard: React.FC<CardProps & { variant?: 'full' | 'mini' }> = ({ 
  data, 
  isOpponent, 
  isAttacking, 
  delay = 0,
  variant = 'full'
}) => {
  if (variant === 'mini') {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className={`w-16 h-20 bg-slate-800 border-2 rounded ${isOpponent ? 'border-red-500/50' : 'border-blue-500/50'} relative overflow-hidden flex flex-col items-center justify-center`}
      >
        <div className="absolute inset-0 digital-grid opacity-10" />
        <span className="text-[10px] font-black italic rotate-[-10deg]">{data.name[0]}</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ y: 50, opacity: 0, rotateY: isOpponent ? 180 : 0 }}
      animate={{ 
        y: isAttacking ? (isOpponent ? 100 : -100) : 0,
        x: isAttacking ? (isOpponent ? -50 : 50) : 0,
        opacity: 1,
        rotateY: isOpponent ? 160 : 20, // 2.5D Tilt
        rotateX: 10,
        scale: isAttacking ? 1.1 : 1
      }}
      transition={{ 
        delay, 
        duration: 0.8, 
        type: "spring", 
        stiffness: 100,
        repeat: isAttacking ? 1 : 0,
        repeatType: "reverse"
      }}
      style={{ transformStyle: "preserve-3d" }}
      className={`relative w-48 h-68 rounded-lg card-shadow border-4 overflow-hidden
        ${isOpponent ? 'border-red-500/50' : 'border-blue-500/50'}
        bg-slate-900/90 flex flex-col`}
    >
      {/* Card Header */}
      <div className="bg-black/80 px-2 py-1 flex justify-between items-center border-b border-white/20">
        <span className="text-[10px] font-bold tracking-tighter opacity-70 italic text-white">
          {data.level.toUpperCase()}
        </span>
        <div className="flex gap-1 items-center">
             <div className={`w-2 h-2 rounded-full ${data.type === 'Fire' ? 'bg-red-500' : 'bg-blue-500'}`} />
             <span className="text-[12px] font-black italic text-white">{data.name}</span>
        </div>
      </div>

      {/* Digimon Image Area */}
      <div className="flex-1 relative bg-gradient-to-b from-slate-800 to-black overflow-hidden flex items-center justify-center p-4">
          {/* Abstract Digimon Placeholder */}
          <div className="w-full h-full relative z-10 flex items-center justify-center">
            <div className={`w-24 h-24 rounded-full blur-2xl opacity-40 animate-pulse ${isOpponent ? 'bg-red-500' : 'bg-blue-500'}`} />
            <div className={`absolute inset-0 flex items-center justify-center text-4xl font-black ${isOpponent ? 'text-red-500' : 'text-blue-500'} opacity-20`}>
                {data.name[0]}
            </div>
            {/* Inner "Digivolving" Grid */}
            <div className="absolute inset-0 opacity-10 digital-grid" />
          </div>
          
          {/* HP Bar on Card */}
          <div className="absolute bottom-2 left-2 right-2 flex flex-col gap-0.5">
             <div className="flex justify-between items-center text-[10px] font-mono font-bold text-white shadow-black drop-shadow-sm">
                <span>HP</span>
                <span>{data.hp} / {data.maxHp}</span>
             </div>
             <div className="h-1.5 w-full bg-black/50 border border-white/20 rounded-full overflow-hidden">
                <motion.div 
                    initial={{ width: "100%" }}
                    animate={{ width: `${(data.hp / data.maxHp) * 100}%` }}
                    className={`h-full ${isOpponent ? 'bg-ps-red' : 'bg-ps-blue'} shadow-[0_0_8px_rgba(0,0,0,1)]`}
                />
             </div>
          </div>
      </div>

      {/* Attacks Footer */}
      <div className="h-16 bg-black/90 p-1.5 flex flex-col gap-1 border-t border-white/10 font-mono">
        <div className="flex justify-between items-center group">
            <div className="flex items-center gap-1">
                <Circle className="w-2.5 h-2.5 text-ps-red fill-ps-red" />
                <span className="text-[10px] text-white/90">{data.attacks.circle.name}</span>
            </div>
            <span className="text-[10px] font-bold text-ps-red">{data.attacks.circle.damage}</span>
        </div>
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-1">
                <Triangle className="w-2.5 h-2.5 text-ps-blue fill-ps-blue" />
                <span className="text-[10px] text-white/90">{data.attacks.triangle.name}</span>
            </div>
            <span className="text-[10px] font-bold text-ps-blue">{data.attacks.triangle.damage}</span>
        </div>
        <div className="flex justify-between items-center">
            <div className="flex items-center gap-1">
                <X className="w-2.5 h-2.5 text-ps-yellow" />
                <span className="text-[10px] text-white/90">{data.attacks.cross.name}</span>
            </div>
            <span className="text-[10px] font-bold text-ps-yellow">{data.attacks.cross.damage}</span>
        </div>
      </div>

      {/* Backside (CSS Only) */}
      <div 
        className="absolute inset-0 bg-slate-900 border-4 border-slate-700 flex flex-col items-center justify-center p-4 backface-hidden"
        style={{ transform: "rotateY(180deg)", backfaceVisibility: "hidden" }}
      >
          <div className="w-full h-full border-2 border-white/10 rounded flex items-center justify-center relative overflow-hidden">
             <div className="absolute inset-0 digital-grid opacity-20" />
             <div className="w-20 h-20 border-4 border-blue-500/30 rounded-full rotate-45 flex items-center justify-center">
                <div className="w-12 h-12 border-2 border-blue-400/50 rounded-full" />
             </div>
          </div>
      </div>
    </motion.div>
  );
};
