import React from "react";
import { motion } from "motion/react";
import { DigimonCardData, GameState } from "../types";
import { DigimonCard } from "./Card";
import { Circle, Triangle, X, Swords } from "lucide-react";

interface HUDProps {
  player: {
    active: DigimonCardData;
    hp: number;
    maxHp: number;
  };
  opponent: {
    active: DigimonCardData;
    hp: number;
    maxHp: number;
  };
  onAttack: (type: 'circle' | 'triangle' | 'cross') => void;
  disabled?: boolean;
  state: GameState;
}

export const BattleHUD: React.FC<HUDProps> = ({ player, opponent, onAttack, disabled, state }) => {
  return (
    <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-2 z-50 overflow-hidden font-mono text-white">
      
      {/* --- OPPONENT SECTION (Top) --- */}
      <div className="grid grid-cols-[1fr_300px_1fr] gap-2 h-1/4">
        {/* Opponent Deck/Trash */}
        <div className="flex gap-2 items-start p-2">
            <div className="w-12 h-16 bg-ps-red/20 border border-ps-red/50 flex flex-col items-center justify-center">
                <span className="text-[6px]">TRASH</span>
                <span className="text-sm font-black">{state.opponent.trash.length}</span>
            </div>
            <div className="w-12 h-16 bg-blue-900/40 border border-blue-400/50 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 digital-grid opacity-20" />
                <span className="text-[6px] z-10">DECK</span>
                <span className="text-sm font-black z-10">{state.opponent.deck.length}</span>
            </div>
        </div>

        {/* Opponent Active Frame */}
        <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-ps-red/10 border-x-2 border-b-4 border-ps-red/80 p-2 flex flex-col relative overflow-hidden"
        >
            <div className="absolute top-0 left-0 bg-ps-red px-2 text-[8px] font-bold">OPPONENT</div>
            <div className="mt-1 flex justify-between items-end border-b border-white/20 pb-0.5">
                <span className="text-lg font-black italic">{opponent.active.name}</span>
                <div className="flex flex-col items-end">
                    <span className="text-[6px] opacity-50 uppercase">{opponent.active.level}</span>
                    <span className="text-ps-red font-bold text-xs">HP {opponent.hp}</span>
                </div>
            </div>
            <div className="mt-2 h-1.5 bg-slate-800 rounded-full overflow-hidden border border-white/10">
                <motion.div 
                    initial={{ width: "100%" }}
                    animate={{ width: `${(opponent.hp/opponent.maxHp)*100}%` }}
                    className="h-full bg-ps-red" 
                />
            </div>
        </motion.div>

        {/* Action History / Small Log */}
        <div className="p-2 flex flex-col items-end">
            <div className="bg-black/60 p-2 border-r-2 border-white/20 text-[8px] max-w-[120px]">
                <div className="flex items-center gap-1 opacity-50 mb-1">
                    <Swords className="w-2 h-2" />
                    <span>SYSTEM_LOG</span>
                </div>
                <div className="text-ps-blue whitespace-nowrap overflow-hidden">TURN {state.turn} - {state.phase.toUpperCase()}</div>
            </div>
        </div>
      </div>

      {/* --- PLAYER SECTION (Bottom) --- */}
      <div className="grid grid-cols-[1fr_320px_1fr] gap-2 h-1/3 mt-auto">
        {/* Player Stats Panel */}
        <div className="flex flex-col justify-start p-2 gap-2">
            <motion.div 
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="bg-black/80 p-3 border-l-4 border-ps-blue inline-block self-start min-w-[120px]"
            >
                <div className="text-[8px] opacity-50 mb-1">DIGIVOLVE POWER</div>
                <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-black text-ps-blue">{state.player.dp}</span>
                    <span className="text-[10px] opacity-70 italic text-white/50">pts</span>
                </div>
            </motion.div>
        </div>

        {/* Player Active Frame & Controls - Tactical Detail Monitor */}
        <motion.div 
            initial={{ y: 50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-black/95 border-x-4 border-t-4 border-ps-blue shadow-[0_0_30px_rgba(60,155,255,0.2)] p-3 flex flex-col relative overflow-hidden pointer-events-auto"
        >
            {/* Corner Accents */}
            <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-ps-blue" />
            <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-ps-blue" />
            <div className="absolute bottom-0 right-0 bg-ps-blue px-2 text-[7px] font-black tracking-widest text-black">SYSTEM_STABLE / 0x3CF</div>
            
            <div className="flex gap-3 h-full">
                {/* Visual Monitor Area */}
                <div className="w-1/3 flex flex-col gap-1">
                    <div className="relative aspect-square bg-slate-900 border border-ps-blue/30 overflow-hidden group">
                        <div className="absolute inset-0 bg-ps-blue/5 animate-pulse" />
                        <div className="absolute inset-0 scanline opacity-30" />
                        <img 
                            src={`https://api.dicebear.com/7.x/identicon/svg?seed=${player.active.name}&backgroundColor=${player.active.type === 'Fire' ? 'ff3c3c' : '3c9bff'}`} 
                            alt="Scan"
                            className="w-full h-full object-cover opacity-60 mix-blend-screen scale-110"
                            referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-full h-[1px] bg-ps-blue/40 animate-[scan_2s_linear_infinite]" />
                        </div>
                    </div>
                    <div className="flex flex-col text-[7px] font-black text-ps-blue/60 leading-none">
                        <span>EVO_COST: {player.active.evoCost}P</span>
                        <span>PLUS_DP: {player.active.plusDp}P</span>
                    </div>
                </div>

                {/* Data Readout Area */}
                <div className="flex-1 flex flex-col">
                    <div className="flex justify-between items-baseline mb-1">
                        <span className="text-xl font-black italic tracking-tighter text-white uppercase truncate leading-none">{player.active.name}</span>
                        <div className="px-1.5 bg-ps-blue/20 border border-ps-blue/40 rounded-sm">
                            <span className="text-[8px] font-black text-ps-blue">{player.active.level.toUpperCase()}</span>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-1 mb-2 border-t border-ps-blue/20 pt-1">
                        <div className="flex flex-col">
                            <span className="text-[6px] text-white/40 uppercase">Attribute</span>
                            <span className="text-[8px] font-bold text-ps-blue">{player.active.type.toUpperCase()} TYPE</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[6px] text-white/40 uppercase">Vitality</span>
                            <span className="text-[10px] font-black text-white">{player.hp} <span className="text-[8px] opacity-40">/ {player.active.maxHp}</span></span>
                        </div>
                    </div>

                    {/* HP Progress Bar */}
                    <div className="h-1 bg-slate-800 rounded-full overflow-hidden mb-2">
                        <motion.div 
                            initial={{ width: "100%" }}
                            animate={{ width: `${(player.hp/player.active.maxHp)*100}%` }}
                            className="h-full bg-ps-blue shadow-[0_0_10px_#3c9bff]" 
                        />
                    </div>
                    
                    {/* Compact Attack Controls */}
                    <div className="grid grid-cols-3 gap-1 mt-auto">
                        <button 
                            onClick={() => onAttack('circle')} 
                            disabled={disabled}
                            className={`group border border-ps-red/30 flex flex-col items-center py-1 transition-all 
                                ${disabled ? 'opacity-20' : 'hover:bg-ps-red/20 active:scale-95 bg-slate-900 shadow-[inset_0_0_10px_rgba(255,60,60,0.1)]'}`}
                        >
                            <Circle className="w-3 h-3 text-ps-red fill-current" />
                            <span className="text-[10px] font-black text-ps-red mt-0.5">{player.active.attacks.circle.damage}</span>
                        </button>
                        <button 
                            onClick={() => onAttack('triangle')} 
                            disabled={disabled}
                            className={`group border border-ps-blue/30 flex flex-col items-center py-1 transition-all
                                ${disabled ? 'opacity-20' : 'hover:bg-ps-blue/20 active:scale-95 bg-slate-900 shadow-[inset_0_0_10px_rgba(60,155,255,0.1)]'}`}
                        >
                            <Triangle className="w-3 h-3 text-ps-blue fill-current" />
                            <span className="text-[10px] font-black text-ps-blue mt-0.5">{player.active.attacks.triangle.damage}</span>
                        </button>
                        <button 
                            onClick={() => onAttack('cross')} 
                            disabled={disabled}
                            className={`group border border-ps-yellow/30 flex flex-col items-center py-1 transition-all
                                ${disabled ? 'opacity-20' : 'hover:bg-ps-yellow/20 active:scale-95 bg-slate-900 shadow-[inset_0_0_10px_rgba(255,255,60,0.1)]'}`}
                        >
                            <X className="w-3 h-3 text-ps-yellow" />
                            <span className="text-[10px] font-black text-ps-yellow mt-0.5">{player.active.attacks.cross.damage}</span>
                        </button>
                    </div>
                </div>
            </div>
        </motion.div>

        {/* Player Deck/Trash Panel */}
        <div className="flex gap-2 items-end justify-end p-2 pointer-events-none">
            <div className="w-12 h-16 bg-blue-900/40 border border-blue-400/50 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 digital-grid opacity-20" />
                <span className="text-[6px] z-10">DECK</span>
                <span className="text-sm font-black z-10">{state.player.deck.length}</span>
            </div>
            <div className="w-12 h-16 bg-ps-red/20 border border-ps-red/50 flex flex-col items-center justify-center">
                <span className="text-[6px]">TRASH</span>
                <span className="text-sm font-black">{state.player.trash.length}</span>
            </div>
        </div>
      </div>
    </div>
  );
};
