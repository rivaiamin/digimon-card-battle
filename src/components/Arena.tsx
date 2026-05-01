import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { DigimonCard } from "./Card";
import { BattleHUD } from "./BattleHUD";
import { INITIAL_DECK, OPPONENT_DECK, SAMPLE_PLAYER_DIGIMON, SAMPLE_OPPONENT_DIGIMON } from "../constants";
import { GameState, DigimonCardData, PlayerState } from "../types";
import { getAllCards } from "../services/cardService";

const INITIAL_PLAYER_STATE: PlayerState = {
    active: { ...SAMPLE_PLAYER_DIGIMON },
    hp: SAMPLE_PLAYER_DIGIMON.hp,
    hand: INITIAL_DECK.slice(0, 4),
    deck: INITIAL_DECK.slice(4),
    trash: [],
    dp: 10,
    score: 0,
    supportCard: null,
    selectedAttack: null
};

const INITIAL_OPPONENT_STATE: PlayerState = {
    active: { ...SAMPLE_OPPONENT_DIGIMON },
    hp: SAMPLE_OPPONENT_DIGIMON.hp,
    hand: OPPONENT_DECK.slice(0, 4),
    deck: OPPONENT_DECK.slice(4),
    trash: [],
    dp: 0,
    score: 0,
    supportCard: null,
    selectedAttack: null
};

export const Arena: React.FC = () => {
    const [gameState, setGameState] = useState<GameState>({
        player: INITIAL_PLAYER_STATE,
        opponent: INITIAL_OPPONENT_STATE,
        phase: 'draw',
        turn: 1,
        isPlayerTurn: true,
        message: "DRAW PHASE",
        hasDiscarded: false
    });

    const [isAnimating, setIsAnimating] = useState(false);
    const [cameraState, setCameraState] = useState<'idle' | 'attack' | 'damage'>('idle');
    const [hoveredCard, setHoveredCard] = useState<DigimonCardData | null>(null);

    useEffect(() => {
        async function loadCards() {
            try {
                const dbCards = await getAllCards();
                if (dbCards.length > 0) {
                    console.log(`Loaded ${dbCards.length} cards from database.`);
                    // Optionally update the initial deck with database cards
                    // For now we'll just keep the existing structure but we could replace the deck here
                }
            } catch (e) {
                console.error("Failed to load cards from DB, using fallback.", e);
            }
        }
        loadCards();
    }, []);

    // --- PHASE TRANSITIONS ---

    const nextPhase = useCallback(() => {
        setGameState(prev => {
            const phases: GameState['phase'][] = ['draw', 'evolution', 'preparation', 'support', 'battle', 'resolution'];
            const currentIndex = phases.indexOf(prev.phase);
            const nextIndex = (currentIndex + 1) % phases.length;
            const nextPhaseValue = phases[nextIndex];

            // Handle Phase specific logic on transition
            let message = nextPhaseValue.toUpperCase() + " PHASE";
            
            if (nextPhaseValue === 'draw') {
                return { 
                    ...prev, 
                    phase: nextPhaseValue, 
                    message,
                    turn: prev.turn + 1,
                    hasDiscarded: false
                };
            }

            return { ...prev, phase: nextPhaseValue, message };
        });
    }, []);

    const handleDraw = () => {
        setGameState(prev => {
            const player = { ...prev.player };
            const needed = 6 - player.hand.length;
            if (needed > 0) {
                const drawn = player.deck.slice(0, needed);
                player.hand = [...player.hand, ...drawn];
                player.deck = player.deck.slice(needed);
            }
            return { ...prev, player, phase: 'preparation', message: "PREPARATION Phase" };
        });
    };

    const handleDiscardForDP = (cardId: string) => {
        setGameState(prev => {
            if (prev.hasDiscarded) return prev;
            const card = prev.player.hand.find(c => c.id === cardId);
            if (!card) return prev;
            return {
                ...prev,
                hasDiscarded: true,
                player: {
                    ...prev.player,
                    hand: prev.player.hand.filter(c => c.id !== cardId),
                    trash: [...prev.player.trash, card],
                    dp: prev.player.dp + card.plusDp
                }
            };
        });
    };

    const handleEvolution = (cardId: string) => {
        setGameState(prev => {
            const card = prev.player.hand.find(c => c.id === cardId);
            if (!card) return prev;

            // Evolution Rule:
            // 1. Same Type (except for Armor or special cases, but here user said "only digimon with the same element")
            // 2. Progression: Rookie -> Champion -> Ultimate -> Mega
            const levelsRank: Record<string, number> = { 'Rookie': 1, 'Champion': 2, 'Ultimate': 3, 'Mega': 4, 'Armor': 2 };
            const currentLevelRank = levelsRank[prev.player.active!.level] || 0;
            const nextLevelRank = levelsRank[card.level] || 0;

            const isSameType = card.type === prev.player.active!.type;
            const isNextStep = nextLevelRank === currentLevelRank + 1;
            const canAfford = prev.player.dp >= card.evoCost;

            if (isSameType && isNextStep && canAfford) {
                return {
                    ...prev,
                    player: {
                        ...prev.player,
                        active: card,
                        hp: card.maxHp,
                        hand: prev.player.hand.filter(c => c.id !== cardId),
                        trash: [...prev.player.trash, prev.player.active!],
                        dp: prev.player.dp - card.evoCost
                    },
                    phase: 'support',
                    message: `${card.name} DIGIVOLVED!`
                };
            } else {
                let failReason = "";
                if (!isSameType) failReason = "TYPE MISMATCH";
                else if (!isNextStep) failReason = "INVALID LEVEL";
                else if (!canAfford) failReason = "NOT ENOUGH DP";
                
                return {
                    ...prev,
                    message: `EVO FAILED: ${failReason}`
                };
            }
        });
    };

    const handleSupportChoice = (cardId: string) => {
        setGameState(prev => {
            const card = prev.player.hand.find(c => c.id === cardId);
            if (!card) return prev;
            return {
                ...prev,
                player: {
                    ...prev.player,
                    supportCard: card,
                    hand: prev.player.hand.filter(c => c.id !== cardId)
                },
                phase: 'battle',
                message: "SELECT ATTACK"
            };
        });
    };

    const handleAttack = (type: 'circle' | 'triangle' | 'cross') => {
        setGameState(prev => ({
            ...prev,
            player: { ...prev.player, selectedAttack: type },
            message: "RESOLVING BATTLE..."
        }));
        resolveBattle(type);
    };

    const resolveBattle = (playerAttackType: 'circle' | 'triangle' | 'cross') => {
        setIsAnimating(true);
        setCameraState('attack');

        // CPU Logic: Picks random attack and potentially a support card
        const opponentAttackType = ['circle', 'triangle', 'cross'][Math.floor(Math.random() * 3)] as 'circle' | 'triangle' | 'cross';
        
        setGameState(prev => {
            const p = { ...prev.player };
            const o = { ...prev.opponent };
            
            // Opponent simple AI: Use a support card if available in hand (50% chance)
            if (o.hand.length > 0 && Math.random() > 0.5) {
                o.supportCard = o.hand[Math.floor(Math.random() * o.hand.length)];
                o.hand = o.hand.filter(c => c.id !== o.supportCard?.id);
            }

            let pAtk = p.active!.attacks[playerAttackType].damage;
            let oAtk = o.active!.attacks[opponentAttackType].damage;

            // Apply Player Support
            if (p.supportCard?.supportEffect) {
                const effect = p.supportCard.supportEffect;
                if (effect.type === 'atk_buff') {
                    if (effect.targetAttack === 'all' || effect.targetAttack === playerAttackType) {
                        pAtk += effect.value;
                    }
                }
                if (effect.type === 'hp_heal') {
                    p.hp = Math.min(p.active!.maxHp, p.hp + effect.value);
                }
                if (effect.type === 'halve_hp') {
                    o.hp = Math.floor(o.hp / 2);
                }
            }

            // Apply Opponent Support
            if (o.supportCard?.supportEffect) {
                const effect = o.supportCard.supportEffect;
                if (effect.type === 'atk_buff') {
                    if (effect.targetAttack === 'all' || effect.targetAttack === opponentAttackType) {
                        oAtk += effect.value;
                    }
                }
                if (effect.type === 'hp_heal') {
                    o.hp = Math.min(o.active!.maxHp, o.hp + effect.value);
                }
            }

            // Resolution logic with delay
            setTimeout(() => {
                setGameState(current => {
                    const nextP = { ...current.player };
                    const nextO = { ...current.opponent };

                    // We re-calculate damage here or use captured values
                    // For simplicity in this functional update, I'll apply the damage now
                    nextO.hp = Math.max(0, nextO.hp - pAtk);
                    nextP.hp = Math.max(0, nextP.hp - oAtk);

                    let message = "BATTLE RESOLVED";

                    if (nextO.hp === 0) {
                        nextP.score += 1;
                        message = "OPPONENT DEFEATED!";
                        nextO.active = { ...SAMPLE_OPPONENT_DIGIMON };
                        nextO.hp = nextO.active.maxHp;
                    }
                    if (nextP.hp === 0) {
                        nextO.score += 1;
                        message = "PLAYER DEFEATED!";
                        nextP.active = { ...SAMPLE_PLAYER_DIGIMON };
                        nextP.hp = nextP.active.maxHp;
                    }

                    return {
                        ...current,
                        player: { ...nextP, supportCard: null, selectedAttack: null },
                        opponent: { ...nextO, supportCard: null, selectedAttack: null },
                        phase: 'draw',
                        message: message + ` [T${current.turn + 1}]`
                    };
                });
                setIsAnimating(false);
                setCameraState('idle');
            }, 1500);

            return { ...prev, player: p, opponent: o };
        });
    };

    return (
        <div className="relative w-screen h-screen overflow-hidden bg-black flex items-center justify-center perspective-stage">
            <div className="scanlines" />

            {/* MESSAGE OVERLAY */}
            <div className="absolute top-1/4 left-0 w-full flex justify-center z-[70] pointer-events-none">
                <motion.div 
                    key={gameState.message}
                    initial={{ scale: 2, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-ps-blue/80 px-12 py-2 skew-x-[-20deg] border-y-2 border-white"
                >
                    <span className="text-4xl font-black italic tracking-tighter text-white skew-x-[20deg] block">
                        {gameState.message}
                    </span>
                </motion.div>
            </div>

            {/* ARENA FLOOR */}
            <motion.div 
                animate={{ 
                    rotateX: cameraState === 'attack' ? 30 : 45,
                    translateZ: cameraState === 'attack' ? 150 : 0,
                    scale: cameraState === 'attack' ? 1.3 : 1.1
                }}
                transition={{ duration: 0.8 }}
                className="relative w-[200vw] h-[200vh] bg-neutral-950 flex items-center justify-center arena-surface digital-grid"
            >
                {/* 3D Battle Elements */}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center gap-64 h-96 items-center">
                    {/* Player Area */}
                    <div className="relative" style={{ transform: "rotateX(-45deg)" }}>
                        {gameState.player.active && (
                            <DigimonCard 
                                data={{...gameState.player.active, hp: gameState.player.hp}} 
                                isAttacking={isAnimating && cameraState === 'attack'}
                                onHover={setHoveredCard}
                            />
                        )}
                        {gameState.player.supportCard && (
                             <div className="absolute -right-32 top-0 opacity-50 rotate-12 scale-75">
                                 <DigimonCard data={gameState.player.supportCard} variant="mini" onHover={setHoveredCard} />
                             </div>
                        )}
                    </div>

                    {/* Opponent Area */}
                    <div className="relative" style={{ transform: "rotateX(-45deg)" }}>
                        {gameState.opponent.active && (
                            <DigimonCard 
                                data={{...gameState.opponent.active, hp: gameState.opponent.hp}} 
                                isOpponent 
                                isAttacking={isAnimating && cameraState === 'damage'}
                                onHover={setHoveredCard}
                            />
                        )}
                    </div>
                </div>
            </motion.div>

            {/* BATTLE HUD */}
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
                disabled={isAnimating || (gameState.phase !== 'battle')}
            />

            {/* PHASE CONTROLS (Hand) */}
            <div className="fixed bottom-4 left-4 z-[60] flex flex-col gap-2 pointer-events-none">
                 {gameState.phase === 'draw' && (
                     <button 
                        onClick={handleDraw}
                        className="pointer-events-auto bg-ps-blue text-white px-8 py-4 font-black italic border-4 border-white hover:bg-white hover:text-ps-blue"
                     >
                        START DRAW PHASE
                     </button>
                 )}

                 {gameState.phase === 'preparation' && (
                     <div className="flex flex-col gap-4">
                        <div className="bg-black/80 p-2 text-white text-xs border border-ps-yellow uppercase">
                            {gameState.hasDiscarded ? "DP Gained. Proceed to Evolution." : "Preparation: Discard ONE card to gain DP"}
                        </div>
                        <div className="flex gap-2">
                             <button onClick={() => setGameState(s => ({...s, phase: 'evolution', message: "EVOLUTION PHASE"}))} className="pointer-events-auto bg-ps-yellow text-black font-bold p-4 skew-x-[-10deg]"><span className="skew-x-[10deg] block">GO TO EVO</span></button>
                             {!gameState.hasDiscarded && gameState.player.hand.map(c => (
                                 <div key={c.id} onClick={() => handleDiscardForDP(c.id)} className="pointer-events-auto cursor-pointer group relative">
                                     <DigimonCard data={c} variant="mini" onHover={setHoveredCard} />
                                     <div className="absolute inset-0 bg-ps-red/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[8px] font-bold text-center p-1">DISCARD<br/>(+{c.plusDp} DP)</div>
                                 </div>
                             ))}
                        </div>
                     </div>
                 )}

                 {gameState.phase === 'evolution' && (
                     <div className="flex flex-col gap-4">
                        <div className="bg-black/80 p-2 text-white text-xs border border-ps-blue uppercase">Evolution: Pick a Digimon to evolve</div>
                        <div className="flex gap-2">
                             <button onClick={() => setGameState(s => ({...s, phase: 'support', message: "SUPPORT PHASE"}))} className="pointer-events-auto bg-slate-800 text-white p-4 skew-x-[-10deg]"><span className="skew-x-[10deg] block">SKIP EVO</span></button>
                             {gameState.player.hand.map(c => (
                                 <div key={c.id} onClick={() => handleEvolution(c.id)} className="pointer-events-auto cursor-pointer">
                                     <DigimonCard data={c} variant="mini" onHover={setHoveredCard} />
                                     {c.evoCost > gameState.player.dp && <div className="text-[10px] text-red-500 font-bold">NO DP</div>}
                                     <div className="text-[10px] bg-ps-blue px-1 text-white">COST: {c.evoCost}</div>
                                 </div>
                             ))}
                        </div>
                     </div>
                 )}

                 {gameState.phase === 'support' && (
                     <div className="flex flex-col gap-4">
                        <div className="bg-black/80 p-2 text-white text-xs border border-white">SELECT SUPPORT CARD</div>
                        <div className="flex gap-2">
                             <button onClick={() => setGameState(s => ({...s, phase: 'battle'}))} className="pointer-events-auto bg-slate-800 text-white p-4">NO SUPPORT</button>
                             {gameState.player.hand.map(c => (
                                 <div key={c.id} onClick={() => handleSupportChoice(c.id)} className="pointer-events-auto cursor-pointer group relative">
                                     <DigimonCard data={c} variant="mini" onHover={setHoveredCard} />
                                     {c.supportEffect && (
                                         <div className="absolute inset-x-0 bottom-full bg-black text-[8px] p-1 border border-white/20 whitespace-nowrap">
                                             {c.supportEffect.description}
                                         </div>
                                     )}
                                 </div>
                             ))}
                        </div>
                     </div>
                 )}
            </div>

            {/* SCORE COUNTER */}
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[100] flex gap-8">
                <div className="flex gap-2">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className={`w-4 h-4 rotate-45 border-2 ${i < gameState.player.score ? 'bg-ps-blue border-white shadow-[0_0_10px_#3c9bff]' : 'bg-transparent border-ps-blue/40'}`} />
                    ))}
                </div>
                <div className="text-white/20 font-black italic">VS</div>
                <div className="flex gap-2">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className={`w-4 h-4 rotate-45 border-2 ${i < gameState.opponent.score ? 'bg-ps-red border-white shadow-[0_0_10px_#ff3c3c]' : 'bg-transparent border-ps-red/40'}`} />
                    ))}
                </div>
            </div>

            {/* CARD DETAIL OVERLAY */}
            <AnimatePresence>
                {hoveredCard && (
                    <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="fixed top-24 left-10 z-[150] w-80 bg-black/95 border-2 border-ps-blue p-4 shadow-[0_0_50px_rgba(60,155,255,0.3)] pointer-events-none"
                    >
                        <div className="flex justify-between items-start mb-4 border-b border-ps-blue/30 pb-2">
                            <div>
                                <h2 className="text-2xl font-black italic text-white uppercase leading-none">{hoveredCard.name}</h2>
                                <span className="text-xs font-bold text-ps-blue">{hoveredCard.level.toUpperCase()} / {hoveredCard.type.toUpperCase()}</span>
                            </div>
                            <div className="bg-ps-blue/20 p-2 border border-ps-blue/50">
                                <span className="text-xl font-black text-ps-blue leading-none">{hoveredCard.hp}</span>
                                <span className="text-[8px] block opacity-50">HP</span>
                            </div>
                        </div>

                        {/* SUPPORT EFFECT (HIGH PRIORITY) */}
                        {hoveredCard.supportEffect && (
                            <div className="mb-6 bg-ps-blue/10 border border-ps-blue/40 p-3">
                                <div className="text-[10px] font-black text-ps-blue uppercase mb-1 tracking-widest flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-ps-blue animate-pulse" />
                                    Support Effect
                                </div>
                                <p className="text-sm font-bold text-white leading-relaxed">
                                    {hoveredCard.supportEffect.description}
                                </p>
                            </div>
                        )}

                        {/* ATTACK DETAILS */}
                        <div className="flex flex-col gap-3">
                            {[
                                { type: 'circle', color: 'ps-red', data: hoveredCard.attacks.circle },
                                { type: 'triangle', color: 'ps-blue', data: hoveredCard.attacks.triangle },
                                { type: 'cross', color: 'ps-yellow', data: hoveredCard.attacks.cross }
                            ].map((atk) => (
                                <div key={atk.type} className={`border-l-2 border-${atk.color} pl-3 py-1 bg-${atk.color}/5`}>
                                    <div className="flex justify-between items-center mb-1">
                                        <span className={`text-xs font-black text-${atk.color} uppercase`}>{atk.data.name}</span>
                                        <span className={`text-sm font-black text-${atk.color} italic`}>{atk.data.damage}</span>
                                    </div>
                                    <p className="text-[10px] text-white/60 leading-tight">
                                        {atk.data.description || "Standard damage attack."}
                                    </p>
                                </div>
                            ))}
                        </div>

                        {/* EVO INFO */}
                        <div className="mt-6 flex justify-between pt-2 border-t border-white/10 text-[10px] font-bold">
                            <div className="flex flex-col">
                                <span className="text-white/40 uppercase">Evo Cost</span>
                                <span className="text-ps-blue">{hoveredCard.evoCost} DP</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-white/40 uppercase">Plus DP</span>
                                <span className="text-ps-yellow">+{hoveredCard.plusDp}</span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            
            {(gameState.player.score >= 3 || gameState.opponent.score >= 3) && (
                <div className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center">
                    <div className="text-center">
                        <h1 className="text-8xl font-black text-ps-yellow italic mb-8">
                            {gameState.player.score >= 3 ? "BATTLE WON" : "BATTLE LOST"}
                        </h1>
                        <button 
                            onClick={() => window.location.reload()}
                            className="bg-ps-yellow px-12 py-4 font-black"
                        >
                            RETURN TO WORLD MAP
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
