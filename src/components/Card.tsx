import React from "react";
import { motion } from "motion/react";
import { Circle, Triangle, X, Zap, Flame, Snowflake, TreePine, Ghost } from "lucide-react";
import { DEFAULT_CARD_ATTACKS } from "../constants";
import { cardImageSrc } from "../lib/cardImageSrc";
import { DigimonCardData } from "../types";
import { useAudio } from "../context/AudioProvider";

interface CardProps {
  data: DigimonCardData;
  isOpponent?: boolean;
  isAttacking?: boolean;
  isRaised?: boolean;
  isHit?: boolean;
  isKo?: boolean;
  delay?: number;
  /** Mini hand cards: `from-deck` slides up when newly drawn. */
  miniEnter?: "default" | "from-deck" | "none";
  onHover?: (data: DigimonCardData | null) => void;
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
  isRaised = false,
  isHit = false,
  isKo = false,
  delay = 0,
  variant = 'full',
  miniEnter = 'default',
  onHover
}) => {
  const isMini = variant === 'mini';
  const attacks = data.attacks ?? DEFAULT_CARD_ATTACKS;
  const audio = useAudio();

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
              <span className={`${isMini ? 'text-[10px] truncate max-w-[50px]' : 'text-xl'} font-black italic tracking-tighter text-white leading-tight uppercase`}>
                {data.name}
              </span>
              {!isMini && <span className="text-xs font-bold text-ps-blue italic leading-none">{data.type.toUpperCase()} TYPE</span>}
            </div>
        </div>
        <div className="flex flex-col items-end">
            <div className={`${isMini ? 'px-1 py-0' : 'bg-white/10 px-2 py-0.5'} rounded-sm border border-white/20`}>
               <span className={`${isMini ? 'text-[10px]' : 'text-xs'} font-black text-white`}>{data.level.toUpperCase()}</span>
            </div>
            {!isMini && <span className="text-xs font-bold text-white/50 mt-1">LV. {data.level[0]}</span>}
        </div>
      </div>

      {/* IMAGE CONTAINER */}
      <div className="flex-1 relative bg-neutral-900 overflow-hidden flex items-center justify-center border-y-2 border-black">
          <div className="absolute inset-0 z-20 pointer-events-none opacity-20 digital-grid bg-[size:10px_10px]" />
          
          <div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
                <div className={`absolute ${isMini ? 'w-16 h-16 blur-[20px]' : 'w-32 h-32 blur-[40px]'} rounded-full opacity-20 ${isOpponent ? 'bg-red-500' : 'bg-blue-500'}`} />
                
                <div className="w-full h-full relative group">
                    <img 
                      src={cardImageSrc(data)} 
                      alt={data.name}
                      className="w-full h-full object-cover opacity-80 card-art-blend"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent" />
                </div>

                {/* HP DISPLAY */}
                <div className={`absolute ${isMini ? 'bottom-0.5 right-0.5 p-1' : 'bottom-2 right-2 p-2 pr-4'} bg-black/95 border-r-4 border-ps-blue skew-x-[-15deg] shadow-xl`}>
                    <div className="skew-x-[15deg] flex flex-col items-end">
                        {!isMini && (
                            <div className="flex items-center gap-1">
                               <span className="text-xs font-black text-ps-blue">HP</span>
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
            { icon: Circle, color: 'ps-red', atk: attacks.circle },
            { icon: Triangle, color: 'ps-blue', atk: attacks.triangle },
            { icon: X, color: 'ps-yellow', atk: attacks.cross }
        ].map((item, idx) => (
            <div key={idx} className={`flex justify-between items-center ${isMini ? 'px-1' : 'px-3 py-1.5'} bg-${item.color}/5 border-l-2 border-${item.color}`}>
                <div className="flex items-center gap-1 md:gap-3">
                    <item.icon className={`${isMini ? 'w-2 h-2' : 'w-5 h-5'} text-${item.color} ${item.icon !== X ? 'fill-current' : 'font-black'}`} />
                    {!isMini && <span className="text-sm font-bold text-white uppercase">{item.atk.name}</span>}
                </div>
                <span className={`${isMini ? 'text-[10px]' : 'text-xl'} font-black text-${item.color} italic tabular-nums`}>{item.atk.damage}</span>
            </div>
        ))}
      </div>
    </>
  );

  if (isMini) {
    const miniInitial =
      miniEnter === "from-deck"
        ? { y: 88, opacity: 0, scale: 0.7, rotate: -6 }
        : miniEnter === "none"
          ? false
          : { scale: 0.8, opacity: 0 };
    const miniAnimate =
      miniEnter === "from-deck"
        ? { y: 0, opacity: 1, scale: 1, rotate: 0 }
        : { scale: 1, opacity: 1 };

    return (
      <motion.div
        key={miniEnter === "from-deck" ? `deck-${data.id}` : data.id}
        initial={miniInitial}
        animate={miniAnimate}
        transition={
          miniEnter === "from-deck"
            ? { type: "spring", stiffness: 280, damping: 22, delay }
            : { duration: 0.25, delay }
        }
        whileHover={{ scale: 1.1, translateY: -10, zIndex: 100 }}
        onMouseEnter={() => {
          audio.playUiHover();
          onHover?.(data);
        }}
        onMouseLeave={() => onHover?.(null)}
        className={`w-24 h-36 bg-slate-950 border-2 rounded-sm shadow-xl relative overflow-hidden flex flex-col cursor-pointer pointer-events-auto
            ${isOpponent ? 'border-ps-red/40' : 'border-ps-blue/40'}`}
      >
        {/* Compact version of the main card UI for hand cards */}
        <div className="bg-black p-1 flex justify-between items-center border-b border-white/5">
            <div className="bg-ps-blue/10 p-0.5 rounded border border-ps-blue/20">
                <div className="scale-75"><TypeIcon type={data.type} /></div>
            </div>
            <span className="text-[10px] font-black italic text-white/90 uppercase truncate w-12">{data.name}</span>
            <span className="text-[10px] font-bold text-white/60">{data.level[0]}</span>
        </div>
        <div className="flex-1 relative bg-neutral-900 flex items-center justify-center">
            <img 
                src={cardImageSrc(data)} 
                alt={data.name}
                className="w-full h-full object-cover opacity-60"
            />
            <div className="absolute bottom-1 right-1 bg-black/90 px-1 border-r-2 border-ps-blue">
                <span className="text-xs font-black italic text-ps-blue tabular-nums">{data.hp}</span>
            </div>
        </div>
        <div className="bg-black/95 p-1 flex flex-col gap-0.5">
            <div className="flex justify-between items-center px-1 border-l border-ps-red">
                <Circle className="w-1.5 h-1.5 text-ps-red fill-current" />
                <span className="text-[10px] font-bold text-ps-red tabular-nums">{attacks.circle.damage}</span>
            </div>
            <div className="flex justify-between items-center px-1 border-l border-ps-blue">
                <Triangle className="w-1.5 h-1.5 text-ps-blue fill-current" />
                <span className="text-[10px] font-bold text-ps-blue tabular-nums">{attacks.triangle.damage}</span>
            </div>
        </div>
      </motion.div>
    );
  }

  const knockbackX = isOpponent ? 56 : -56;
  const knockbackRot = isOpponent ? 8 : -8;
  const raiseY = isRaised ? (isOpponent ? 40 : -40) : 0;
  const lungeY = isAttacking && !isRaised ? (isOpponent ? 120 : -120) : 0;

  return (
    <motion.div
      initial={{ y: 50, opacity: 0, rotateY: 0 }}
      animate={{ 
        y: raiseY || lungeY,
        x: isHit ? knockbackX : isAttacking && !isRaised ? (isOpponent ? -40 : 40) : 0,
        rotate: isHit ? knockbackRot : 0,
        rotateY: 5, 
        rotateX: 5,
        scale: isRaised ? 1.08 : isAttacking ? 1.15 : isHit ? 0.96 : isKo ? 0.85 : 1,
        opacity: isKo ? 0.35 : 1,
        filter: isKo ? "grayscale(1) brightness(0.6)" : "none",
      }}
      onMouseEnter={() => {
        audio.playUiHover();
        onHover?.(data);
      }}
      onMouseLeave={() => onHover?.(null)}
      transition={{ 
        delay, 
        duration: isHit ? 0.5 : isRaised ? 0.7 : 1.1, 
        type: "spring", 
        stiffness: isHit ? 380 : isRaised ? 200 : 120,
        damping: isHit ? 16 : isRaised ? 18 : 20,
        repeat: isAttacking && !isRaised ? 1 : 0,
        repeatType: "reverse"
      }}
      style={{ transformStyle: "preserve-3d" }}
      className={`relative w-72 h-[480px] rounded-lg shadow-2xl border-4
        ${isOpponent ? 'border-ps-red' : 'border-ps-blue'}
        bg-slate-950 flex flex-col pointer-events-auto`}
    >
      {cardContent}

      {/* Evolution Info Overlay - Only for Full Cards in certain contexts or hand? 
          Actually user just wanted the UI replicated. I will keep this overlay for full cards only. */}
      {!isMini && (
        <div className="absolute top-1/2 left-0 -translate-x-full bg-surface-strong border border-line p-2.5 text-xs flex flex-col gap-1.5">
            <div className="text-muted uppercase">Evo Cost</div>
            <div className="text-ps-blue font-bold tabular-nums">{data.evoCost} DP</div>
            <div className="h-px bg-line" />
            <div className="text-muted uppercase">Plus DP</div>
            <div className="text-ps-yellow font-bold tabular-nums">+{data.plusDp}</div>
        </div>
      )}
    </motion.div>
  );
};
