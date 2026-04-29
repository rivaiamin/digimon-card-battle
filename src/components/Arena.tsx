import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { DigimonCard } from "./Card";
import { BattleHUD } from "./BattleHUD";
import { MINI_CARDS, SAMPLE_PLAYER_DIGIMON, SAMPLE_OPPONENT_DIGIMON } from "../constants";
import { GameState } from "../types";

export const Arena: React.FC = () => {
    const [gameState, setGameState] = useState<GameState>({
        player: { 
            active: { ...SAMPLE_PLAYER_DIGIMON }, 
            hp: SAMPLE_PLAYER_DIGIMON.hp, 
            hand: [...MINI_CARDS],
            deck: [...MINI_CARDS, ...MINI_CARDS],
            trash: [],
            dp: 10
        },
        opponent: { 
            active: { ...SAMPLE_OPPONENT_DIGIMON }, 
            hp: SAMPLE_OPPONENT_DIGIMON.hp,
            hand: [],
            deck: [...MINI_CARDS, ...MINI_CARDS],
            trash: [],
            dp: 0
        },
        phase: 'preparation'
    });

    const [isAttacking, setIsAttacking] = useState(false);
    const [cameraState, setCameraState] = useState<'idle' | 'attack' | 'damage'>('idle');

    const handleAttack = (type: 'circle' | 'triangle' | 'cross') => {
        if (isAttacking || gameState.phase !== 'preparation') return;

        setIsAttacking(true);
        setCameraState('attack');
        
        const playerDamage = gameState.player.active?.attacks[type].damage || 0;
        
        // Characteristic PS1 Attack sequence
        setTimeout(() => {
            setGameState(prev => ({
                ...prev,
                opponent: { ...prev.opponent, hp: Math.max(0, prev.opponent.hp - playerDamage) }
            }));
            setCameraState('damage');
        }, 800);

        setTimeout(() => {
            // Opponent Counter (Simple AI)
            const opponentType = ['circle', 'triangle', 'cross'][Math.floor(Math.random() * 3)] as 'circle' | 'triangle' | 'cross';
            const opponentDamage = gameState.opponent.active?.attacks[opponentType].damage || 0;
            
            setGameState(prev => ({
                ...prev,
                player: { ...prev.player, hp: Math.max(0, prev.player.hp - opponentDamage) }
            }));
        }, 1600);

        setTimeout(() => {
            setIsAttacking(false);
            setCameraState('idle');
        }, 2400);
    };

    return (
        <div className="relative w-screen h-screen overflow-hidden bg-ps-dark flex items-center justify-center perspective-stage">
            {/* Scanlines Effect Overlay */}
            <div className="scanlines" />

            {/* 30 degree tilted floor / Arena Stage */}
            <motion.div 
                animate={{ 
                    rotateX: cameraState === 'attack' ? 45 : (cameraState === 'damage' ? 55 : 60),
                    translateZ: cameraState === 'attack' ? 100 : 0,
                    scale: cameraState === 'attack' ? 1.2 : 1
                }}
                transition={{ duration: 0.6, ease: "easeInOut" }}
                className="relative w-[150vw] h-[150vh] bg-neutral-950 flex items-center justify-center arena-surface digital-grid border-b-8 border-ps-blue/20"
            >
                {/* Arena Center Marking */}
                <div className="absolute w-[800px] h-[800px] border-4 border-ps-blue/10 rounded-full flex items-center justify-center">
                    <div className="w-[600px] h-[600px] border border-ps-blue/5 rounded-full" />
                </div>

                {/* Cards Container (on top of the grid) */}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center gap-64 h-96 items-center">
                    
                    {/* Player Side */}
                    <div className="relative" style={{ transform: "rotateX(-60deg)" }}>
                        {gameState.player.active && (
                            <DigimonCard 
                                data={{...gameState.player.active, hp: gameState.player.hp}} 
                                isAttacking={isAttacking && cameraState === 'attack'}
                            />
                        )}
                        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-48 h-8 bg-ps-blue/20 blur-xl rounded-full" />
                    </div>

                    {/* Opponent Side */}
                    <div className="relative" style={{ transform: "rotateX(-60deg)" }}>
                        {gameState.opponent.active && (
                            <DigimonCard 
                                data={{...gameState.opponent.active, hp: gameState.opponent.hp}} 
                                isOpponent 
                                isAttacking={isAttacking && cameraState === 'damage'}
                            />
                        )}
                        <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-48 h-8 bg-ps-red/20 blur-xl rounded-full" />
                    </div>
                </div>

                {/* Ambient Particles */}
                <div className="absolute inset-0 pointer-events-none opacity-30 overflow-hidden">
                    {[...Array(20)].map((_, i) => (
                        <motion.div
                            key={i}
                            animate={{ 
                                y: [-1000, 1000],
                                opacity: [0, 1, 0]
                            }}
                            transition={{ 
                                duration: Math.random() * 5 + 5, 
                                repeat: Infinity,
                                delay: Math.random() * 10
                            }}
                            className="absolute bg-white w-0.5 h-32"
                            style={{ 
                                left: `${Math.random() * 100}%`,
                                top: `-10%`
                            }}
                        />
                    ))}
                </div>
            </motion.div>

            {/* HUD Layers */}
            <BattleHUD 
                state={gameState}
                player={{
                    active: gameState.player.active!,
                    hp: gameState.player.hp,
                    maxHp: gameState.player.active!.maxHp
                }}
                opponent={{
                    active: gameState.opponent.active!,
                    hp: gameState.opponent.hp,
                    maxHp: gameState.opponent.active!.maxHp
                }}
                onAttack={handleAttack}
                disabled={isAttacking}
            />

            {/* Damage Flashes */}
            <AnimatePresence>
                {cameraState === 'damage' && (
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 0.5, 0] }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 bg-red-600/30 z-[60] pointer-events-none"
                    />
                )}
            </AnimatePresence>

            {/* Victory/Defeat Screen Overlay */}
            { (gameState.player.hp <= 0 || gameState.opponent.hp <= 0) && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-md z-[100] flex flex-center items-center justify-center p-8">
                    <motion.div 
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        className="bg-black/90 border-4 border-ps-yellow p-12 text-center skew-x-[-10deg]"
                    >
                        <div className="skew-x-[10deg]">
                            <h2 className="text-6xl font-black italic tracking-tighter text-ps-yellow mb-4">
                                {gameState.player.hp > 0 ? "VICTORY" : "GAME OVER"}
                            </h2>
                            <p className="text-white opacity-50 mb-8 font-mono">BATTLE PHASE TERMINATED</p>
                            <button 
                                onClick={() => window.location.reload()}
                                className="px-8 py-3 bg-ps-yellow text-black font-black hover:bg-white transition-colors"
                            >
                                TRANSMIT RESTART SIGNAL
                            </button>
                        </div>
                    </motion.div>
                </div>
            )}
        </div>
    );
};
