import React from "react";
import { motion } from "motion/react";
import { DigimonCardData } from "../types";
import { Circle, Triangle, X, Zap, Flame, Snowflake, TreePine, Ghost } from "lucide-react";

interface CardProps {
  data: DigimonCardData;
  isOpponent?: boolean;
  isAttacking?: boolean;
  delay?: number;
}

const TypeIcon = ({ type }: { type: string }) => {
    switch (type) {
        case 'Fire': return <Flame className="w-4 h-4 text-orange-500" />;
        case 'Ice': return <Snowflake className="w-4 h-4 text-blue-300" />;
        case 'Nature': return <TreePine className="w-4 h-4 text-green-500" />;
        case 'Dark': return <Ghost className="w-4 h-4 text-purple-500" />;
        default: return <Zap className="w-4 h-4 text-yellow-500" />;
    }
}

export const DigimonCard: React.FC<CardProps & { variant?: 'full' | 'mini' }> = ({ 
  data, 
  isOpponent, 
  isAttacking, 
  delay = 0,
  variant = 'full'
}) => {
  const isMini = variant === 'mini';

  const cardContent = (
    <>
      {/* CARD TOP INFO */}
      <div className={`${isMini ? 'p-1' : 'p-2'} bg-black flex justify-between items-center border-b border-white/10`}>
        <div className="flex items-center gap-1">
            <div className={`${isMini ? 'p-0.5' : 'p-1.5'} bg-ps-blue/20 border border-ps-blue/50 rounded shadow-[0_0_5px_rgba(60,155,255,0.3)]`}>
                <div className={isMini ? 'scale-75' : ''}>
                    <TypeIcon type={data.type} />
                </div>
            </div>
            <div className="flex flex-col">
              <span className={`${isMini ? 'text-[8px] truncate max-w-[50px]' : 'text-xl'} font-black italic tracking-tighter text-white leading-tight uppercase`}>
                {data.name}
              </span>
              {!isMini && <span className="text-[10px] font-bold text-ps-blue italic leading-none">{data.type.toUpperCase()} TYPE</span>}
            </div>
        </div>
        <div className="flex flex-col items-end">
            <div className={`${isMini ? 'px-1 py-0' : 'bg-white/10 px-2 py-0.5'} rounded-sm border border-white/20`}>
               <span className={`${isMini ? 'text-[6px]' : 'text-[10px]'} font-black text-white`}>{data.level.toUpperCase()}</span>
            </div>
            {!isMini && <span className="text-[8px] font-bold text-white/30 mt-1">LV. {data.level[0]}</span>}
        </div>
      </div>

      {/* IMAGE CONTAINER */}
      <div className="flex-1 relative bg-neutral-900 overflow-hidden flex items-center justify-center border-y-2 border-black">
          <div className="absolute inset-0 z-20 pointer-events-none opacity-20 digital-grid bg-[size:10px_10px]" />
          
          <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
                <div className={`absolute ${isMini ? 'w-16 h-16 blur-[20px]' : 'w-32 h-32 blur-[40px]'} rounded-full opacity-20 ${isOpponent ? 'bg-red-500' : 'bg-blue-500'}`} />
                
                <div className="w-full h-full relative group">
                    <img 
                      src={`https://api.dicebear.com/7.x/identicon/svg?seed=${data.name}&backgroundColor=${data.type === 'Fire' ? 'ff3c3c' : '3c9bff'}`} 
                      alt={data.name}
                      className="w-full h-full object-cover opacity-80 mix-blend-screen"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                </div>

                {/* HP DISPLAY */}
                <div className={`absolute ${isMini ? 'bottom-0.5 right-0.5 p-1' : 'bottom-2 right-2 p-2 pr-4'} bg-black/95 border-r-4 border-ps-blue skew-x-[-15deg] shadow-xl`}>
                    <div className="skew-x-[15deg] flex flex-col items-end">
                        {!isMini && (
                            <div className="flex items-center gap-1">
                               <span className="text-[8px] font-black text-ps-blue">HP</span>
                               <div className="w-12 h-1 bg-slate-800 rounded-full overflow-hidden">
                                  <div className="h-full bg-ps-blue" style={{ width: `${(data.hp/data.maxHp)*100}%` }} />
                               </div>
                            </div>
                        )}
                        <span className={`${isMini ? 'text-xs' : 'text-2xl'} font-black italic text-ps-blue drop-shadow-[0_0_8px_#3c9bff] leading-none`}>
                            {data.hp}
                        </span>
                    </div>
                </div>
          </div>
      </div>

      {/* ATTACK PANELS */}
      <div className={`${isMini ? 'h-12 p-1 gap-0.5' : 'h-36 p-4 gap-2'} bg-black/95 flex flex-col border-t-2 border-white/10 font-mono`}>
        {[
            { icon: Circle, color: 'ps-red', atk: data.attacks.circle },
            { icon: Triangle, color: 'ps-blue', atk: data.attacks.triangle },
            { icon: X, color: 'ps-yellow', atk: data.attacks.cross }
        ].map((item, idx) => (
            <div key={idx} className={`flex justify-between items-center ${isMini ? 'px-1' : 'px-3 py-1.5'} bg-${item.color}/5 border-l-2 border-${item.color}`}>
                <div className="flex items-center gap-1 md:gap-3">
                    <item.icon className={`${isMini ? 'w-2 h-2' : 'w-5 h-5'} text-${item.color} ${item.icon !== X ? 'fill-current' : 'font-black'}`} />
                    {!isMini && <span className="text-sm font-bold text-white uppercase">{item.atk.name}</span>}
                </div>
                <span className={`${isMini ? 'text-[8px]' : 'text-xl'} font-black text-${item.color} italic`}>{item.atk.damage}</span>
            </div>
        ))}
      </div>
    </>
  );

  if (isMini) {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        whileHover={{ scale: 1.1, translateY: -10, zIndex: 100 }}
        className={`w-24 h-36 bg-slate-950 border-2 rounded-sm shadow-xl relative overflow-hidden flex flex-col cursor-pointer pointer-events-auto
            ${isOpponent ? 'border-ps-red/40' : 'border-ps-blue/40'}`}
      >
        {/* Compact version of the main card UI for hand cards */}
        <div className="bg-black p-1 flex justify-between items-center border-b border-white/5">
            <div className="bg-ps-blue/10 p-0.5 rounded border border-ps-blue/20">
                <div className="scale-75"><TypeIcon type={data.type} /></div>
            </div>
            <span className="text-[7px] font-black italic text-white/80 uppercase truncate w-12">{data.name}</span>
            <span className="text-[6px] font-bold text-white/40">{data.level[0]}</span>
        </div>
        <div className="flex-1 relative bg-neutral-900 flex items-center justify-center">
            <img 
                src={`https://api.dicebear.com/7.x/identicon/svg?seed=${data.name}&backgroundColor=${data.type === 'Fire' ? 'ff3c3c' : '3c9bff'}`} 
                alt={data.name}
                className="w-full h-full object-cover opacity-60"
            />
            <div className="absolute bottom-1 right-1 bg-black/90 px-1 border-r-2 border-ps-blue">
                <span className="text-[9px] font-black italic text-ps-blue">{data.hp}</span>
            </div>
        </div>
        <div className="bg-black/95 p-1 flex flex-col gap-0.5">
            <div className="flex justify-between items-center px-1 border-l border-ps-red">
                <Circle className="w-1.5 h-1.5 text-ps-red fill-current" />
                <span className="text-[7px] font-bold text-ps-red">{data.attacks.circle.damage}</span>
            </div>
            <div className="flex justify-between items-center px-1 border-l border-ps-blue">
                <Triangle className="w-1.5 h-1.5 text-ps-blue fill-current" />
                <span className="text-[7px] font-bold text-ps-blue">{data.attacks.triangle.damage}</span>
            </div>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ y: 50, opacity: 0, rotateY: isOpponent ? 180 : 0 }}
      animate={{ 
        y: isAttacking ? (isOpponent ? 150 : -150) : 0,
        x: isAttacking ? (isOpponent ? -50 : 50) : 0,
        opacity: 1,
        rotateY: isOpponent ? 175 : 5, 
        rotateX: 5,
        scale: isAttacking ? 1.2 : 1
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
      className={`relative w-72 h-[480px] rounded-lg shadow-2xl border-[12px]
        ${isOpponent ? 'border-ps-red/80' : 'border-ps-blue/80'}
        bg-slate-950 flex flex-col`}
    >
      {cardContent}

      {/* Evolution Info Overlay - Only for Full Cards in certain contexts or hand? 
          Actually user just wanted the UI replicated. I will keep this overlay for full cards only. */}
      {!isMini && (
        <div className="absolute top-1/2 left-0 -translate-x-full bg-slate-900/90 border border-white/20 p-2 text-[8px] flex flex-col gap-1">
            <div className="text-white/40 uppercase">Evo Cost</div>
            <div className="text-ps-blue font-bold">{data.evoCost} DP</div>
            <div className="h-px bg-white/20" />
            <div className="text-white/40 uppercase">Plus DP</div>
            <div className="text-ps-yellow font-bold">+{data.plusDp}</div>
        </div>
      )}
    </motion.div>
  );
};
