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
      <div className="grid grid-cols-[1fr_360px_1fr] gap-2 h-44 mt-12">
        {/* Opponent Deck/Trash */}
        <div className="flex gap-2 items-start p-4">
            <div className="w-12 h-16 bg-ps-red/20 border border-ps-red/50 flex flex-col items-center justify-center">
                <span className="text-[6px]">TRASH</span>
                <span className="text-sm font-black">{state.opponent.trash.length}</span>
            </div>
            <div className="w-14 h-20 bg-blue-900/40 border border-blue-400/50 flex flex-col items-center justify-center relative overflow-hidden group">
                <div className="absolute inset-0 digital-grid opacity-20" />
                <span className="text-[6px] z-10 opacity-50">DECK</span>
                <span className="text-xl font-black z-10">{state.opponent.deck.length}</span>
            </div>
        </div>

        {/* Opponent Active Frame - Tactical Detail Mirror */}
        <motion.div 
            initial={{ y: -50, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-black/95 border-x-4 border-b-4 border-ps-red shadow-[0_0_40px_rgba(255,60,60,0.25)] p-4 flex flex-col relative overflow-hidden min-w-[400px] rounded-b-lg"
        >
            <div className="absolute inset-0 digital-grid opacity-5 pointer-events-none" />
            
            {/* System Status Indicators */}
            <div className="absolute bottom-1 left-4 flex gap-4">
                <div className="flex items-center gap-1">
                    <div className="w-1 h-1 bg-ps-red animate-pulse" />
                    <span className="text-[6px] text-ps-red/80 tracking-widest font-black uppercase">Channel_X / Locked</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-1 h-1 bg-red-600" />
                    <span className="text-[6px] text-red-600/80 tracking-widest font-black uppercase">Threat_Level / Critical</span>
                </div>
            </div>
            
            <div className="absolute top-1 right-4 flex items-center gap-2">
                <span className="text-[6px] text-ps-red/40 font-black tracking-widest">TRACE_ALGORITHM_04 // HOSTILE_LINK</span>
            </div>
            
            <div className="flex gap-4 h-full mt-2 mb-2">
                {/* Visual Monitor Area */}
                <div className="w-32 flex flex-col gap-1">
                    <div className="relative aspect-square bg-slate-900 border-2 border-ps-red/40 overflow-hidden shadow-[0_0_15px_rgba(255,60,60,0.2)]">
                        <div className="absolute inset-0 bg-ps-red/5" />
                        <div className="absolute inset-0 scanline opacity-40 z-10" />
                        <img 
                            src={`https://api.dicebear.com/7.x/identicon/svg?seed=${opponent.active.name}&backgroundColor=${opponent.active.type === 'Fire' ? 'ff3c3c' : '3c9bff'}`} 
                            alt="Scan"
                            className="w-full h-full object-cover opacity-70 mix-blend-screen scale-110"
                            referrerPolicy="no-referrer"
                        />
                        {/* Hostile Reticle */}
                        <div className="absolute inset-0 flex items-center justify-center z-20">
                            <div className="w-12 h-12 border border-ps-red/30 rounded-full animate-ping opacity-50" />
                            <div className="absolute w-px h-full bg-ps-red/20" />
                            <div className="absolute h-px w-full bg-ps-red/20" />
                        </div>
                    </div>
                </div>

                {/* Data Readout Area */}
                <div className="flex-1 flex flex-col font-mono">
                    <div className="flex justify-between items-baseline mb-2">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-ps-red leading-none tracking-widest opacity-60">TARGET_ID</span>
                            <span className="text-2xl font-black italic tracking-tighter text-white uppercase leading-none">{opponent.active.name}</span>
                        </div>
                        <div className="px-1.5 bg-ps-red/20 border border-ps-red/40 rounded-sm">
                            <span className="text-xs font-black text-ps-red">{opponent.active.level.toUpperCase()}</span>
                        </div>
                    </div>

                    {/* Stats Grid */}
                    <div className="grid grid-cols-2 gap-2 mb-3 bg-white/5 p-2 border border-white/10 font-mono">
                        <div className="flex flex-col">
                            <span className="text-[7px] text-white/30 uppercase tracking-tighter">Attribute_Type</span>
                            <span className="text-[8px] font-bold text-ps-red uppercase italic">{opponent.active.type}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[7px] text-white/30 uppercase tracking-tighter">Target_Vitals / HP</span>
                            <span className="text-sm font-black text-white italic">{opponent.hp} <span className="text-[10px] opacity-30">/ {opponent.active.maxHp}</span></span>
                        </div>
                    </div>

                    {/* HP Progress Bar */}
                    <div className="h-2 bg-slate-900 border border-ps-red/20 rounded-sm overflow-hidden mt-auto mb-1">
                        <motion.div 
                            initial={{ width: "100%" }}
                            animate={{ width: `${(opponent.hp/opponent.maxHp)*100}%` }}
                            className="h-full bg-ps-red shadow-[0_0_15px_#ff3c3c]" 
                        />
                        <div className="absolute inset-0 flex justify-between pointer-events-none opacity-20">
                            {[...Array(10)].map((_, i) => <div key={i} className="w-px h-full bg-white" />)}
                        </div>
                    </div>
                    <div className="text-[6px] text-ps-red font-bold text-right tracking-[0.2em]">ANALYZE_PHASE_COMPLETE</div>
                </div>
            </div>
        </motion.div>

        {/* Action History / Small Log */}
        <div className="p-4 flex flex-col items-end">
            <div className="bg-black/60 p-3 border-r-4 border-ps-red text-[8px] max-w-[140px] shadow-lg">
                <div className="flex items-center gap-1 opacity-50 mb-2">
                    <Swords className="w-2 h-2 text-ps-red" />
                    <span className="tracking-widest">HOSTILE_DETECTION</span>
                </div>
                <div className="text-ps-red/80 uppercase font-black">TURN {state.turn} - {state.phase}</div>
                <div className="text-[6px] text-white/40 mt-1 uppercase">Monitor active...</div>
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
            className="bg-black/95 border-x-4 border-t-4 border-ps-blue shadow-[0_0_40px_rgba(60,155,255,0.25)] p-4 flex flex-col relative overflow-hidden pointer-events-auto min-w-[400px] rounded-t-lg"
        >
            <div className="absolute inset-0 digital-grid opacity-5 pointer-events-none" />
            
            {/* System Status Indicators */}
            <div className="absolute top-1 left-4 flex gap-4">
                <div className="flex items-center gap-1">
                    <div className="w-1 h-1 bg-ps-blue animate-pulse" />
                    <span className="text-[6px] text-ps-blue/80 tracking-widest font-black uppercase">Channel_A / Linked</span>
                </div>
                <div className="flex items-center gap-1">
                    <div className="w-1 h-1 bg-green-500" />
                    <span className="text-[6px] text-green-500/80 tracking-widest font-black uppercase">Signal_Strength / 100%</span>
                </div>
            </div>
            
            <div className="absolute bottom-1 right-4 flex items-center gap-2">
                <span className="text-[6px] text-ps-blue/40 font-black tracking-widest">DRIVE_UNIT_01 // SECURE_SYNC</span>
            </div>
            
            <div className="flex gap-4 h-full mt-2">
                {/* Visual Monitor Area */}
                <div className="w-32 flex flex-col gap-2">
                    <div className="relative aspect-square bg-slate-900 border-2 border-ps-blue/40 overflow-hidden shadow-[0_0_15px_rgba(60,155,255,0.2)]">
                        <div className="absolute inset-0 bg-ps-blue/5" />
                        <div className="absolute inset-0 scanline opacity-40 z-10" />
                        <img 
                            src={`https://api.dicebear.com/7.x/identicon/svg?seed=${player.active.name}&backgroundColor=${player.active.type === 'Fire' ? 'ff3c3c' : '3c9bff'}`} 
                            alt="Scan"
                            className="w-full h-full object-cover opacity-70 mix-blend-screen scale-110"
                            referrerPolicy="no-referrer"
                        />
                        {/* Target Crosshair */}
                        <div className="absolute inset-0 pointer-events-none z-20">
                            <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-ps-blue/50" />
                            <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-ps-blue/50" />
                            <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-ps-blue/50" />
                            <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-ps-blue/50" />
                        </div>
                    </div>
                    <div className="flex justify-between items-center text-[7px] font-black text-ps-blue italic">
                        <span className="bg-ps-blue/20 px-1">DP: {player.dp}</span>
                        <span className="bg-ps-blue/20 px-1">EVO: {player.active.evoCost}</span>
                    </div>
                </div>

                {/* Data Readout Area */}
                <div className="flex-1 flex flex-col font-mono">
                    <div className="flex justify-between items-end mb-2">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-ps-blue leading-none tracking-widest opacity-60">ACTIVE_UNIT</span>
                            <span className="text-2xl font-black italic tracking-tighter text-white uppercase leading-none">{player.active.name}</span>
                        </div>
                        <div className="bg-ps-blue/20 px-2 py-0.5 border border-ps-blue/40 rounded-sm">
                            <span className="text-xs font-black text-ps-blue">{player.active.level.toUpperCase()}</span>
                        </div>
                    </div>

                    {/* Vital Stats */}
                    <div className="grid grid-cols-2 gap-2 mb-3 bg-white/5 p-2 border border-white/10">
                        <div className="flex flex-col">
                            <span className="text-[7px] text-white/30 uppercase tracking-tighter">Attribute_Type</span>
                            <span className="text-[10px] font-bold text-ps-blue uppercase italic">{player.active.type}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[7px] text-white/30 uppercase tracking-tighter">Vital_Sign / HP</span>
                            <span className="text-sm font-black text-white italic">{player.hp} <span className="text-[10px] opacity-30">/ {player.active.maxHp}</span></span>
                        </div>
                    </div>

                    {/* HP Bar with Segments */}
                    <div className="relative h-2 bg-slate-900 border border-ps-blue/20 rounded-sm overflow-hidden mb-4">
                        <motion.div 
                            initial={{ width: "100%" }}
                            animate={{ width: `${(player.hp/player.active.maxHp)*100}%` }}
                            className="h-full bg-ps-blue shadow-[0_0_15px_#3c9bff]" 
                        />
                        <div className="absolute inset-0 flex justify-between pointer-events-none opacity-20">
                            {[...Array(10)].map((_, i) => <div key={i} className="w-px h-full bg-white" />)}
                        </div>
                    </div>
                    
                    {/* Tactical Command Input */}
                    <div className="grid grid-cols-3 gap-2 mt-auto">
                        {[
                            { type: 'circle', icon: Circle, color: 'ps-red', dmg: player.active.attacks.circle.damage },
                            { type: 'triangle', icon: Triangle, color: 'ps-blue', dmg: player.active.attacks.triangle.damage },
                            { type: 'cross', icon: X, color: 'ps-yellow', dmg: player.active.attacks.cross.damage }
                        ].map((btn) => (
                            <button 
                                key={btn.type}
                                onClick={() => onAttack(btn.type as any)} 
                                disabled={disabled}
                                className={`group relative border border-${btn.color}/30 flex flex-col items-center py-1 transition-all overflow-hidden
                                    ${disabled ? 'opacity-20 translate-y-2' : `hover:bg-${btn.color}/20 active:scale-95 bg-slate-900 shadow-[inset_0_0_15px_rgba(0,0,0,0.5)]`}`}
                            >
                                <div className={`absolute top-0 left-0 w-1 h-full bg-${btn.color} opacity-20`} />
                                <btn.icon className={`w-3.5 h-3.5 text-${btn.color} fill-current group-hover:scale-110 transition-transform`} />
                                <span className={`text-xs font-black text-${btn.color} mt-0.5 italic tracking-tighter`}>{btn.dmg}</span>
                                {disabled && <div className="absolute inset-0 bg-black/40 z-10" />}
                            </button>
                        ))}
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
