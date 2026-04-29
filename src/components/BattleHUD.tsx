import React from "react";
import { motion } from "motion/react";
import { DigimonCardData } from "../types";
import { DigimonCard } from "./Card";
import { Circle, Triangle, X, Shield, Swords } from "lucide-react";

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
}

export const BattleHUD: React.FC<HUDProps & { state: any }> = ({ player, opponent, onAttack, disabled, state }) => {
  return (
    <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-2 z-50 overflow-hidden font-mono text-white">
      
      {/* --- OPPONENT SECTION (Top) --- */}
      <div className="grid grid-cols-[1fr_300px_1fr] gap-2 h-1/3">
        {/* Opponent Deck/Trash */}
        <div className="flex gap-2 items-start p-2">
            <div className="w-16 h-20 bg-ps-red/20 border border-ps-red/50 flex flex-col items-center justify-center">
                <span className="text-[8px]">TRASH</span>
                <span className="text-xl font-black">{state.opponent.trash.length}</span>
            </div>
            <div className="w-16 h-20 bg-blue-900/40 border border-blue-400/50 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 digital-grid opacity-20" />
                <span className="text-[8px] z-10">DECK</span>
                <span className="text-xl font-black z-10">{state.opponent.deck.length}</span>
            </div>
        </div>

        {/* Opponent Active Frame */}
        <div className="bg-ps-red/10 border-x-4 border-b-4 border-ps-red/80 p-2 flex flex-col relative overflow-hidden">
            <div className="absolute top-0 left-0 bg-ps-red px-2 text-[10px] font-bold">OPPONENT</div>
            <div className="mt-2 flex justify-between items-end border-b border-white/20 pb-1">
                <span className="text-xl font-black italic">{opponent.active.name}</span>
                <div className="flex flex-col items-end">
                    <span className="text-[8px] opacity-50">DP</span>
                    <span className="text-ps-red font-bold">{opponent.active.dp}</span>
                </div>
            </div>
            <div className="flex-1 flex items-center justify-center gap-4">
                <div className="text-2xl font-black text-ps-red">{opponent.hp}</div>
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-ps-red" style={{ width: `${(opponent.hp/opponent.maxHp)*100}%` }} />
                </div>
            </div>
        </div>

        {/* Opponent Hand (Mini) */}
        <div className="flex gap-1 justify-end p-2 opacity-50">
            {[...Array(4)].map((_, i) => (
                <div key={i} className="w-10 h-14 bg-ps-red/20 border border-ps-red/40 rounded shadow-inner" />
            ))}
        </div>
      </div>

      {/* --- CENTER AREA (Battle Cinematic Room) --- */}
      <div className="flex-1 relative">
         <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-1 border border-white/5 bg-white/2 opacity-20" />
      </div>

      {/* --- PLAYER SECTION (Bottom) --- */}
      <div className="grid grid-cols-[1fr_300px_1fr] gap-2 h-1/3 mt-auto">
        {/* Player Hand */}
        <div className="flex gap-2 items-end p-2 pointer-events-auto">
            {state.player.hand.map((card: any) => (
                <div key={card.id} className="hover:-translate-y-2 transition-transform cursor-pointer">
                    <DigimonCard data={card} variant="mini" />
                </div>
            ))}
        </div>

        {/* Player Active Frame */}
        <div className="bg-ps-blue/10 border-x-4 border-t-4 border-ps-blue/80 p-2 flex flex-col relative overflow-hidden">
            <div className="absolute bottom-0 right-0 bg-ps-blue px-2 text-[10px] font-bold">PLAYER</div>
            <div className="flex-1 flex items-center justify-center gap-4">
                <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                    <div className="h-full bg-ps-blue" style={{ width: `${(player.hp/player.maxHp)*100}%` }} />
                </div>
                <div className="text-2xl font-black text-ps-blue">{player.hp}</div>
            </div>
            <div className="flex justify-between items-start border-t border-white/20 pt-1">
                <div className="flex flex-col">
                    <span className="text-[8px] opacity-50">DP</span>
                    <span className="text-ps-blue font-bold">{player.active.dp}</span>
                </div>
                <span className="text-xl font-black italic">{player.active.name}</span>
            </div>
            
            {/* Attack Inputs */}
            <div className="mt-2 grid grid-cols-3 gap-1 pointer-events-auto">
                <button onClick={() => onAttack('circle')} className="bg-ps-red/20 hover:bg-ps-red/40 p-1 flex justify-center border border-ps-red/50"><Circle className="w-3 h-3 text-ps-red fill-current"/></button>
                <button onClick={() => onAttack('triangle')} className="bg-ps-blue/20 hover:bg-ps-blue/40 p-1 flex justify-center border border-ps-blue/50"><Triangle className="w-3 h-3 text-ps-blue fill-current"/></button>
                <button onClick={() => onAttack('cross')} className="bg-yellow-900/20 hover:bg-ps-yellow/40 p-1 flex justify-center border border-ps-yellow/50"><X className="w-3 h-3 text-ps-yellow"/></button>
            </div>
        </div>

        {/* Player Deck/Trash */}
        <div className="flex gap-2 items-end justify-end p-2 pointer-events-auto">
            <div className="w-16 h-20 bg-blue-900/40 border border-blue-400/50 flex flex-col items-center justify-center relative overflow-hidden">
                <div className="absolute inset-0 digital-grid opacity-20" />
                <span className="text-[8px] z-10">DECK</span>
                <span className="text-xl font-black z-10">{state.player.deck.length}</span>
            </div>
            <div className="w-16 h-20 bg-ps-red/20 border border-ps-red/50 flex flex-col items-center justify-center">
                <span className="text-[8px]">TRASH</span>
                <span className="text-xl font-black">{state.player.trash.length}</span>
            </div>
        </div>
      </div>
    </div>
  );
};
