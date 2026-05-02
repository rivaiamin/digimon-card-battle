import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { cardImageSrc } from "../lib/cardImageSrc";
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
      <div className="grid grid-cols-[1fr_400px_1fr] gap-2 h-44 mt-12">
        {/* Opponent Deck/Trash */}
        <div className="flex gap-2 items-start p-4">
            <div className="w-12 h-16 bg-ps-red/20 border border-ps-red/50 flex flex-col items-center justify-center shadow-lg">
                <span className="text-[6px] font-black opacity-50">VOID_B</span>
                <span className="text-sm font-black">{state.opponent.trash.length}</span>
            </div>
            <div className="w-14 h-20 bg-blue-900/40 border-2 border-blue-400/50 flex flex-col items-center justify-center relative overflow-hidden group shadow-lg">
                <div className="absolute inset-0 digital-grid opacity-20" />
                <span className="text-[6px] z-10 opacity-50 font-black tracking-tighter">POOL_B</span>
                <span className="text-xl font-black z-10">{state.opponent.deck.length}</span>
            </div>
        </div>

        {/* Opponent Active Frame - Tactical Detail Mirror */}
        <div className="relative pointer-events-auto">
            {/* Hostile Drive Core Telemetry */}
            <motion.div 
                initial={{ x: -20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="absolute -left-[140px] top-0 bg-black/95 border-l-4 border-ps-red p-3 shadow-xl z-20 min-w-[120px]"
            >
                <div className="text-[10px] font-black text-ps-red opacity-50 mb-1 tracking-widest uppercase italic">Threat_DP</div>
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black italic text-ps-red drop-shadow-[0_0_8px_rgba(255,60,60,0.4)]">{state.opponent.dp}</span>
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-tighter">Units</span>
                </div>
                <div className="mt-2 flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className={`h-1.5 w-full ${state.opponent.dp > i * 10 ? 'bg-ps-red' : 'bg-ps-red/10'}`} />
                    ))}
                </div>
            </motion.div>

            <motion.div 
                initial={{ y: -50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-black/95 border-x-4 border-b-4 border-ps-red shadow-[0_0_40px_rgba(255,60,60,0.25)] p-4 flex flex-col relative overflow-hidden w-full rounded-b-lg h-full"
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
                                src={cardImageSrc(opponent.active)} 
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
                        {/* Hand Monitor Area */}
                        <div className="flex flex-col mt-1 gap-1">
                             <div className="text-[6px] text-ps-red/60 font-black uppercase tracking-widest">Hand_Status</div>
                             <div className="flex gap-1">
                                {[...Array(Math.min(5, state.opponent.hand.length))].map((_, i) => (
                                    <div key={i} className="w-2.5 h-1.5 bg-ps-red/40 skew-x-[-15deg] animate-pulse" />
                                ))}
                                {state.opponent.hand.length > 5 && (
                                    <span className="text-[6px] text-ps-red font-black self-center">+{state.opponent.hand.length - 5}</span>
                                )}
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
                                animate={{ width: `${(opponent.hp/opponent.active.maxHp)*100}%` }}
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
        </div>

        {/* Action History / Small Log */}
        <div className="p-4 flex flex-col items-end">
            <div className="bg-black/90 p-3 border-r-4 border-ps-red text-[8px] min-w-[140px] shadow-lg">
                <div className="flex items-center gap-1 opacity-50 mb-2">
                    <Swords className="w-2 h-2 text-ps-red" />
                    <span className="tracking-widest font-black uppercase">Hostile_Detect</span>
                </div>
                <div className="text-ps-red/80 uppercase font-black italic">TURN {state.turn} - {state.phase}</div>
                <div className="text-[6px] text-white/40 mt-1 uppercase leading-tight">Live scan processing...<br/>Threat level high.</div>
            </div>
        </div>
      </div>

      {/* --- PLAYER SECTION (Bottom) --- */}
      <div className="grid grid-cols-[1fr_400px_1fr] gap-2 h-44 mb-12">
        {/* Player Secondary Monitor (Left) */}
        <div className="flex flex-col justify-end p-4">
            <div className="bg-black/90 p-3 border-l-4 border-ps-blue opacity-20 inline-block self-start min-w-[140px]">
                <div className="text-[8px] font-black text-ps-blue/40 tracking-widest uppercase">AUX_POWER_01</div>
            </div>
        </div>

        {/* Player Active Frame - Central Tactical Interface */}
        <div className="relative pointer-events-auto">
            {/* Drive Core Telemetry Sidebar */}
            <motion.div 
                initial={{ x: 20, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                className="absolute -right-[140px] bottom-0 bg-black/95 border-r-4 border-ps-blue p-3 shadow-xl z-20 min-w-[120px]"
            >
                <div className="text-[10px] font-black text-ps-blue opacity-50 mb-1 tracking-widest uppercase italic">Drive_Status</div>
                <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-black italic text-ps-blue drop-shadow-[0_0_8px_rgba(60,155,255,0.4)]">{state.player.dp}</span>
                    <span className="text-[10px] font-bold text-white/30 uppercase tracking-tighter">Units</span>
                </div>
                <div className="mt-2 flex gap-0.5">
                    {[...Array(5)].map((_, i) => (
                        <div key={i} className={`h-1.5 w-full ${state.player.dp > i * 10 ? 'bg-ps-blue' : 'bg-ps-blue/10'}`} />
                    ))}
                </div>
            </motion.div>

            <motion.div 
                initial={{ y: 50, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                className="bg-black/95 border-x-4 border-t-4 border-ps-blue shadow-[0_0_40px_rgba(60,155,255,0.25)] p-4 flex flex-col relative overflow-hidden w-full rounded-t-lg h-full"
            >
            <div className="absolute inset-0 digital-grid opacity-5 pointer-events-none" />
            
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
                <span className="text-[6px] text-ps-blue/40 font-black tracking-widest uppercase">Drive_Unit_01 // SECURE_SYNC</span>
            </div>
            
            <div className="flex gap-4 h-full mt-2 mb-2">
                {/* Visual Monitor Area */}
                <div className="w-32 flex flex-col gap-1">
                    <div className="relative aspect-square bg-slate-900 border-2 border-ps-blue/40 overflow-hidden shadow-[0_0_15px_rgba(60,155,255,0.2)]">
                        <div className="absolute inset-0 bg-ps-blue/5" />
                        <div className="absolute inset-0 scanline opacity-40 z-10" />
                        <img 
                            src={cardImageSrc(player.active)} 
                            alt="Scan"
                            className="w-full h-full object-cover opacity-70 mix-blend-screen scale-110"
                            referrerPolicy="no-referrer"
                        />
                        <div className="absolute inset-0 pointer-events-none z-20">
                            <div className="absolute top-2 left-2 w-3 h-3 border-t border-l border-ps-blue/50" />
                            <div className="absolute top-2 right-2 w-3 h-3 border-t border-r border-ps-blue/50" />
                            <div className="absolute bottom-2 left-2 w-3 h-3 border-b border-l border-ps-blue/50" />
                            <div className="absolute bottom-2 right-2 w-3 h-3 border-b border-r border-ps-blue/50" />
                        </div>
                    </div>
                </div>

                {/* Data Readout Area */}
                <div className="flex-1 flex flex-col font-mono">
                    <div className="flex justify-between items-baseline mb-2">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-black text-ps-blue leading-none tracking-widest opacity-60 uppercase">Active_Unit</span>
                            <span className="text-2xl font-black italic tracking-tighter text-white uppercase leading-none">{player.active.name}</span>
                        </div>
                        <div className="bg-ps-blue/20 px-2 py-0.5 border border-ps-blue/40 rounded-sm">
                            <span className="text-xs font-black text-ps-blue">{player.active.level.toUpperCase()}</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-3 bg-white/5 p-2 border border-white/10">
                        <div className="flex flex-col">
                            <span className="text-[7px] text-white/30 uppercase tracking-tighter">Attribute_Type</span>
                            <span className="text-[8px] font-bold text-ps-blue uppercase italic">{player.active.type}</span>
                        </div>
                        <div className="flex flex-col items-end">
                            <span className="text-[7px] text-white/30 uppercase tracking-tighter">Vital_Sign / HP</span>
                            <span className="text-sm font-black text-white italic">{player.hp} <span className="text-[10px] opacity-30">/ {player.active.maxHp}</span></span>
                        </div>
                    </div>

                    <div className="relative h-2 bg-slate-900 border border-ps-blue/20 rounded-sm overflow-hidden mt-auto mb-1">
                        <motion.div 
                            initial={{ width: "100%" }}
                            animate={{ width: `${(player.hp/player.active.maxHp)*100}%` }}
                            className="h-full bg-ps-blue shadow-[0_0_15px_#3c9bff]" 
                        />
                        <div className="absolute inset-0 flex justify-between pointer-events-none opacity-20">
                            {[...Array(10)].map((_, i) => <div key={i} className="w-px h-full bg-white" />)}
                        </div>
                    </div>
                    <div className="text-[6px] text-ps-blue font-bold text-right tracking-[0.2em]">ALL_SYSTEMS_OPERATIONAL</div>
                </div>
            </div>
        </motion.div>
        </div>

        {/* Player Deck/Trash Panel */}
        <div className="flex gap-3 items-end justify-end p-4 pointer-events-none">
            <div className="w-14 h-20 bg-blue-900/40 border-2 border-blue-400/50 flex flex-col items-center justify-center relative overflow-hidden shadow-lg group">
                <div className="absolute inset-0 digital-grid opacity-20" />
                <span className="text-[6px] z-10 opacity-60 font-black tracking-tighter">POOL_A</span>
                <span className="text-2xl font-black z-10 text-blue-400">{state.player.deck.length}</span>
            </div>
            <div className="w-12 h-16 bg-ps-red/20 border border-ps-red/50 flex flex-col items-center justify-center shadow-lg">
                <span className="text-[6px] opacity-60 font-black">VOID_A</span>
                <span className="text-sm font-black text-ps-red">{state.player.trash.length}</span>
            </div>
        </div>
      </div>

      {/* --- ATTACK COMMAND CONSOLE --- */}
      <AnimatePresence>
          {state.phase === 'battle_attack' && !state.player.attackLocked && (
              <motion.div 
                  initial={{ opacity: 0, scale: 0.9, x: 50 }}
                  animate={{ opacity: 1, scale: 1, x: 0 }}
                  exit={{ opacity: 0, scale: 0.9, x: 50 }}
                  className="fixed right-6 bottom-40 flex flex-col gap-2 z-[100] pointer-events-auto items-end"
              >
                  <div className="bg-black/95 border border-ps-blue/40 px-3 py-1 text-[8px] font-black text-ps-blue uppercase tracking-[0.2em] shadow-lg mb-1 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-ps-blue animate-pulse" />
                      Command_Interface // Online
                  </div>
                  
                  <div className="flex flex-col gap-2">
                      {[
                          { type: 'circle', icon: Circle, color: 'ps-red', atk: player.active.attacks.circle },
                          { type: 'triangle', icon: Triangle, color: 'ps-blue', atk: player.active.attacks.triangle },
                          { type: 'cross', icon: X, color: 'ps-yellow', atk: player.active.attacks.cross }
                      ].map((btn) => (
                          <button 
                              key={btn.type}
                              onClick={() => onAttack(btn.type as any)} 
                              disabled={disabled}
                              className={`group relative bg-slate-950/90 border border-${btn.color}/30 p-4 transition-all flex items-center justify-between w-64 shadow-xl skew-x-[-10deg]
                                ${disabled ? 'opacity-30 cursor-not-allowed' : `hover:border-${btn.color} hover:bg-${btn.color}/10 hover:-translate-x-2 active:scale-95`}`}
                          >
                              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:animate-[shimmer_1.5s_infinite] pointer-events-none" />
                              
                              <div className="flex items-center gap-3 skew-x-[10deg]">
                                  <btn.icon className={`w-6 h-6 text-${btn.color} ${btn.type !== 'cross' ? 'fill-current' : 'font-bold'} group-hover:rotate-12 transition-transform`} />
                                  <div className="text-left font-mono">
                                      <div className={`text-[7px] text-${btn.color} opacity-70 font-black uppercase tracking-widest leading-none mb-1`}>{btn.type}::init</div>
                                      <div className="text-xs font-black text-white italic uppercase tracking-tighter leading-none">{btn.atk.name}</div>
                                  </div>
                              </div>
                              
                              <div className={`text-xl font-black italic text-${btn.color} skew-x-[10deg] tabular-nums`}>
                                  {btn.atk.damage}
                              </div>
                          </button>
                      ))}
                  </div>
              </motion.div>
          )}
      </AnimatePresence>
    </div>
  );
};
