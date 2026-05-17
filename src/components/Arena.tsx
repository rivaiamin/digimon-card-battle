import { Room } from "colyseus.js";
import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { DigimonCard } from "./Card";
import { BattleHUD } from "./BattleHUD";
import { DEFAULT_CARD_ATTACKS } from "../constants";
import { GameState, DigimonCardData, PlayerState } from "../types";
import { getAllCards } from "../services/cardService";
import { BattleStateSchema } from "../schema/BattleState";
import { useAudio } from "../context/AudioProvider";
import { useBattleAudio } from "../hooks/useBattleAudio";
import { useBattleVfx } from "../hooks/useBattleVfx";
import { ImpactFlash } from "./battle/ImpactFlash";
import { DamagePopups } from "./battle/DamagePopups";
import { SupportZone } from "./battle/SupportZone";

const INITIAL_PLAYER_STATE: PlayerState = {
    active: null,
    evolutionStack: [],
    hp: 0,
    hand: [],
    deck: [],
    trash: [],
    dp: 0,
    score: 0,
    supportCard: null,
    supportLocked: false,
    selectedAttack: null,
    attackLocked: false
};

const INITIAL_OPPONENT_STATE: PlayerState = {
    active: null,
    evolutionStack: [],
    hp: 0,
    hand: [],
    deck: [],
    trash: [],
    dp: 0,
    score: 0,
    supportCard: null,
    supportLocked: false,
    selectedAttack: null,
    attackLocked: false
};

const mapSchemaCardToData = (c: any): DigimonCardData => {
    const attacks = {
        circle: { ...(c.circle ?? DEFAULT_CARD_ATTACKS.circle), type: 'circle' as const },
        triangle: { ...(c.triangle ?? DEFAULT_CARD_ATTACKS.triangle), type: 'triangle' as const },
        cross: { ...(c.cross ?? DEFAULT_CARD_ATTACKS.cross), type: 'cross' as const },
    };
    return {
        id: c.id,
        name: c.name,
        level: c.level,
        type: c.type,
        hp: c.hp,
        maxHp: c.maxHp,
        dp: c.dp ?? 0,
        plusDp: c.plusDp ?? 0,
        evoCost: c.evoCost ?? 0,
        attacks,
        supportEffect: c.supportEffect
            ? {
                  type: c.supportEffect.type,
                  targetAttack: c.supportEffect.targetAttack || undefined,
                  value: c.supportEffect.value ?? 0,
                  description: c.supportEffect.description ?? "",
                  requireType: c.supportEffect.requireType || undefined,
                  priority: c.supportEffect.priority || undefined,
              }
            : undefined,
        image: c.image ?? "",
    } as DigimonCardData;
};

const mapSchemaToPlayerState = (schema: any): PlayerState => {
    if (!schema) return INITIAL_OPPONENT_STATE;
    return {
        active: schema.active ? mapSchemaCardToData(schema.active) : null,
        evolutionStack: Array.from(schema.evolutionStack || []).map((c: any) => mapSchemaCardToData(c)),
        hp: schema.hp,
        hand: Array.from(schema.hand || []).map((c: any) => mapSchemaCardToData(c)),
        deck: Array.from(schema.deck || []).map((c: any) => mapSchemaCardToData(c)),
        trash: Array.from(schema.trash || []).map((c: any) => mapSchemaCardToData(c)),
        dp: schema.dp,
        score: schema.score,
        supportCard: schema.supportCard ? mapSchemaCardToData(schema.supportCard) : null,
        supportLocked: !!schema.supportLocked,
        selectedAttack: schema.selectedAttack,
        attackLocked: !!schema.attackLocked,
    };
};

type ArenaProps = {
    room: Room<BattleStateSchema>;
};

export const Arena: React.FC<ArenaProps> = ({ room }) => {
    const audio = useAudio();
    const [clickDebug, setClickDebug] = useState<string>("");
    const [gameState, setGameState] = useState<GameState>({
        player: INITIAL_PLAYER_STATE,
        opponent: INITIAL_OPPONENT_STATE,
        phase: 'waiting',
        turn: 1,
        isPlayerTurn: true,
        message: "CONNECTING TO SERVER...",
        hasDiscarded: false,
        winnerSessionId: undefined,
        loserReason: undefined,
    });

    const [hoveredCard, setHoveredCard] = useState<DigimonCardData | null>(null);
    /** Face-down preview of own support until server reveal syncs. */
    const [committedSupport, setCommittedSupport] = useState<DigimonCardData | null>(null);

    useBattleAudio(gameState, room.sessionId);
    const vfx = useBattleVfx(gameState);

    const displayPlayerHp = vfx.displayPlayerHp ?? gameState.player.hp;
    const displayOpponentHp = vfx.displayOpponentHp ?? gameState.opponent.hp;

    const playerActive =
        (vfx.isAnimating ? vfx.frozenField?.playerActive : null) ??
        gameState.player.active;
    const opponentActive =
        (vfx.isAnimating ? vfx.frozenField?.opponentActive : null) ??
        gameState.opponent.active;

    useEffect(() => {
        // Do not call room.leave() here: React StrictMode remounts effects in dev and would
        // disconnect the player right after joining, causing a blank screen / broken room.

        const onStateChange = (state: BattleStateSchema) => {
            const me = state.players.get(room.sessionId);
            const opponentSessionId = Array.from(state.players.keys()).find(id => id !== room.sessionId);
            const opponent = opponentSessionId ? state.players.get(opponentSessionId) : null;

            setGameState(prev => ({
                ...prev,
                player: mapSchemaToPlayerState(me),
                opponent: mapSchemaToPlayerState(opponent),
                phase: state.phase as any,
                turn: state.turn,
                isPlayerTurn: state.activePlayerSessionId === room.sessionId,
                message: state.message,
                winnerSessionId: (state as any).winnerSessionId,
                loserReason: (state as any).loserReason,
            }));
        };

        const onError = (code: number, message?: string) => {
            console.error(`[Colyseus] Room Error: ${code} - ${message}`);
            setGameState(prev => ({ ...prev, message: `ROOM ERROR: ${message} (Code: ${code})` }));
        };

        const onLeave = (code: number) => {
            console.log(`[Colyseus] Left room: ${code}`);
            setGameState(prev => ({ ...prev, phase: 'waiting', message: "DISCONNECTED FROM SERVER" }));
        };

        // Apply current server snapshot immediately. The first client can receive all
        // patches for match start before this effect runs; without a sync read they
        // would never get onStateChange and stay on "CONNECTING TO SERVER...".
        onStateChange(room.state);

        room.onStateChange(onStateChange);
        room.onError(onError);
        room.onLeave(onLeave);

        return () => {
            room.onStateChange.remove(onStateChange);
            room.onError.remove(onError);
            room.onLeave.remove(onLeave);
        };
    }, [room]);

    useEffect(() => {
        async function loadCards() {
            try {
                const dbCards = await getAllCards();
                if (dbCards.length > 0) {
                    console.log(`Loaded ${dbCards.length} cards from database.`);
                }
            } catch (e) {
                console.error("Failed to load cards from DB, using fallback.", e);
            }
        }
        loadCards();
    }, []);

    // --- SERVER-AUTHORITATIVE ACTIONS ---

    const handleDraw = () => {
        audio.playSfx("chime");
        const stamp = new Date().toLocaleTimeString();
        setClickDebug(`[${stamp}] click: sent DRAW (phase=${gameState.phase}, myTurn=${gameState.isPlayerTurn})`);
        room.send("action", { type: "DRAW" });
    };

    const handleDiscardForDP = (cardId: string) => {
        audio.playSfx("thud", { spatial: "player" });
        room.send("action", { type: "DISCARD_FOR_DP", cardIds: [cardId] });
    };

    const handleDeployRookie = (cardId: string) => {
        room.send("action", { type: "DEPLOY_ROOKIE", cardId });
    };

    const handleEvolution = (cardId: string) => {
        room.send("action", { type: "EVOLVE", cardId });
    };

    const handleEndPrep = () => {
        audio.playSfx("menu_click");
        room.send("action", { type: "END_PREP" });
    };

    const handleSupportChoice = (cardId: string | null) => {
        audio.playSfx("thud", { spatial: "player" });
        if (cardId) {
            const card = gameState.player.hand.find(c => c.id === cardId) ?? null;
            setCommittedSupport(card);
        } else {
            setCommittedSupport(null);
        }
        room.send("action", { type: "LOCK_SUPPORT", cardId });
    };

    useEffect(() => {
        if (gameState.phase !== "battle_support" && gameState.phase !== "battle_reveal") {
            setCommittedSupport(null);
        }
    }, [gameState.phase]);

    const handleAttack = (type: 'circle' | 'triangle' | 'cross') => {
        audio.playSfx("tick");
        room.send("action", { type: "LOCK_ATTACK", attack: type });
    };

    if (gameState.phase === 'waiting') {
        return (
            <div className="w-screen h-screen bg-black flex flex-col items-center justify-center">
                <div className="relative">
                    <div className="scanlines z-10" />
                    <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-4xl font-black italic text-ps-blue tracking-tighter"
                    >
                        {gameState.message}
                    </motion.div>
                </div>
                <div className="mt-8 text-white/40 text-xs font-mono animate-pulse">
                    ESTABLISHING NEURAL LINK...
                </div>
            </div>
        );
    }

    const needsBattleActives =
        gameState.phase === 'battle_support' ||
        gameState.phase === 'battle_reveal' ||
        gameState.phase === 'battle_attack' ||
        gameState.phase === 'resolution';

    if (
        gameState.phase !== 'victory' &&
        needsBattleActives &&
        !vfx.isAnimating &&
        (!gameState.player.active || !gameState.opponent.active)
    ) {
        return (
            <div className="w-screen h-screen bg-black flex flex-col items-center justify-center">
                <div className="relative">
                    <div className="scanlines z-10" />
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-4xl font-black italic text-ps-blue tracking-tighter"
                    >
                        {gameState.message || "SYNCING BATTLE STATE..."}
                    </motion.div>
                </div>
                <div className="mt-8 text-white/40 text-xs font-mono animate-pulse">
                    LOADING FIELD DATA...
                </div>
            </div>
        );
    }

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
            <ImpactFlash color={vfx.flashColor} />
            <DamagePopups popups={vfx.popups} />

            <AnimatePresence>
                {vfx.isCounter && vfx.phase === "impact" && (
                    <motion.div
                        initial={{ x: "-120%", opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: "120%", opacity: 0 }}
                        transition={{ duration: 0.28, ease: "easeOut" }}
                        className="fixed top-[18%] left-0 w-full z-[88] pointer-events-none flex justify-center"
                    >
                        <motion.div className="bg-ps-blue/90 border-y-4 border-white px-16 py-2 skew-x-[-18deg] shadow-[0_0_40px_rgba(60,155,255,0.6)]">
                            <span className="block skew-x-[18deg] text-5xl font-black italic text-white tracking-tighter">
                                COUNTER!
                            </span>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>

            <motion.div 
                animate={{ 
                    rotateX: vfx.cameraState === 'attack' ? 28 : vfx.cameraState === 'damage' ? 38 : 45,
                    translateZ: vfx.cameraState === 'attack' ? 140 : vfx.cameraState === 'damage' ? 80 : 0,
                    scale: vfx.cameraState === 'attack' ? 1.28 : vfx.cameraState === 'damage' ? 1.18 : 1.1,
                    x: vfx.phase === "impact" ? [0, -6, 6, -4, 4, 0] : 0,
                }}
                transition={{
                    duration: vfx.phase === "impact" ? 0.28 : vfx.isAnimating ? 0.35 : 0.8,
                    ease: vfx.phase === "impact" ? "easeOut" : "easeInOut",
                }}
                className="relative w-[200vw] h-[200vh] bg-neutral-950 flex items-center justify-center arena-surface digital-grid"
            >
                {/* 3D Battle Elements */}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center gap-64 h-96 items-center">
                    {/* Player Area */}
                    <div className="relative" style={{ transform: "rotateX(-45deg)" }}>
                        {playerActive && (
                            <DigimonCard 
                                data={{...playerActive, hp: displayPlayerHp}} 
                                isAttacking={vfx.playerAttacking}
                                isHit={vfx.playerHit}
                                isKo={vfx.phase === "settle" && vfx.playerKo}
                                onHover={setHoveredCard}
                            />
                        )}
                        <SupportZone
                            side="player"
                            phase={gameState.phase}
                            supportCard={gameState.player.supportCard}
                            supportLocked={!!gameState.player.supportLocked}
                            committedFaceDown={committedSupport}
                            onHover={setHoveredCard}
                        />
                    </div>

                    {/* Opponent Area */}
                    <div className="relative" style={{ transform: "rotateX(-45deg)" }}>
                        {opponentActive && (
                            <DigimonCard 
                                data={{...opponentActive, hp: displayOpponentHp}} 
                                isOpponent 
                                isAttacking={vfx.opponentAttacking}
                                isHit={vfx.opponentHit}
                                isKo={vfx.phase === "settle" && vfx.opponentKo}
                                onHover={setHoveredCard}
                            />
                        )}
                        <SupportZone
                            side="opponent"
                            phase={gameState.phase}
                            supportCard={gameState.opponent.supportCard}
                            supportLocked={!!gameState.opponent.supportLocked}
                            onHover={setHoveredCard}
                        />
                    </div>
                </div>
            </motion.div>

            {/* BATTLE HUD */}
            <BattleHUD 
                state={gameState}
                player={{
                    active: playerActive,
                    hp: displayPlayerHp,
                    maxHp: playerActive?.maxHp ?? gameState.player.active?.maxHp ?? 0
                }}
                opponent={{
                    active: opponentActive,
                    hp: displayOpponentHp,
                    maxHp: opponentActive?.maxHp ?? gameState.opponent.active?.maxHp ?? 0
                }}
                onAttack={handleAttack}
                disabled={
                    vfx.isAnimating ||
                    gameState.phase === 'battle_reveal' ||
                    gameState.phase !== 'battle_attack' ||
                    !!gameState.player.attackLocked
                }
            />

            {/* PHASE CONTROLS (Hand) */}
            <div className="fixed bottom-4 left-4 z-[1000] flex flex-col gap-2 pointer-events-auto isolate">
                 {gameState.phase === 'draw' && gameState.isPlayerTurn && (
                     <button 
                        onClick={handleDraw}
                        className="pointer-events-auto bg-ps-blue text-white px-8 py-4 font-black italic border-4 border-white hover:bg-white hover:text-ps-blue"
                     >
                        START DRAW PHASE
                     </button>
                 )}

                 {clickDebug && (
                    <div className="mt-2 bg-black/80 p-2 text-white/70 text-[10px] border border-white/20 font-mono uppercase pointer-events-none max-w-[320px]">
                        {clickDebug}
                    </div>
                 )}
                 
                 {gameState.phase === 'draw' && !gameState.isPlayerTurn && (
                     <div className="bg-black/80 p-2 text-white/70 text-xs border border-white/20 uppercase pointer-events-none">
                         Opponent is drawing...
                     </div>
                 )}

                 {gameState.phase === 'preparation' && (
                     <div className="flex flex-col gap-4">
                        <div className="bg-black/80 p-2 text-white text-xs border border-ps-yellow uppercase flex items-center justify-between gap-4">
                            <span>
                                {!gameState.player.active
                                    ? "Deploy a Rookie Digimon from your hand (0 cost), then manage DP and evolution."
                                    : "Preparation: Discard cards for DP, then optionally evolve."}
                            </span>
                            {gameState.isPlayerTurn && (
                                <button
                                    onClick={handleEndPrep}
                                    disabled={!gameState.player.active}
                                    className="pointer-events-auto bg-ps-yellow text-black font-black px-4 py-2 border-2 border-black hover:bg-white disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                    END PREP
                                </button>
                            )}
                        </div>

                        {!gameState.player.active && gameState.isPlayerTurn && (
                            <div className="flex flex-col gap-2">
                                <div className="bg-black/80 p-2 text-white text-xs border border-ps-green uppercase">
                                    Deploy Digimon: Choose a Rookie from your hand
                                </div>
                                <div className="flex gap-2 flex-wrap">
                                    {gameState.player.hand.filter(c => c.level === 'Rookie').map(c => (
                                        <div
                                            key={`deploy_${c.id}`}
                                            onClick={() => handleDeployRookie(c.id)}
                                            className="pointer-events-auto cursor-pointer ring-2 ring-ps-green ring-offset-2 ring-offset-black rounded"
                                        >
                                            <DigimonCard data={c} variant="mini" onHover={setHoveredCard} />
                                            <div className="text-[10px] bg-ps-green px-1 text-black font-black text-center">DEPLOY</div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {gameState.player.active && (
                        <>
                        <div className="flex gap-2">
                             {gameState.player.hand.map(c => (
                                 <div key={c.id} onClick={() => handleDiscardForDP(c.id)} className="pointer-events-auto cursor-pointer group relative">
                                     <DigimonCard data={c} variant="mini" onHover={setHoveredCard} />
                                     <div className="absolute inset-0 bg-ps-red/40 opacity-0 group-hover:opacity-100 flex items-center justify-center text-white text-[8px] font-bold text-center p-1">DISCARD<br/>(+{c.plusDp} DP)</div>
                                 </div>
                             ))}
                        </div>

                        <div className="flex flex-col gap-2">
                            <div className="bg-black/80 p-2 text-white text-xs border border-ps-blue uppercase">Evolution: Pick a Digimon to evolve (DP required)</div>
                            <div className="flex gap-2">
                                {gameState.player.hand.map(c => (
                                    <div key={`evo_${c.id}`} onClick={() => handleEvolution(c.id)} className="pointer-events-auto cursor-pointer">
                                        <DigimonCard data={c} variant="mini" onHover={setHoveredCard} />
                                        {c.evoCost > gameState.player.dp && <div className="text-[10px] text-red-500 font-bold">NO DP</div>}
                                        <div className="text-[10px] bg-ps-blue px-1 text-white">COST: {c.evoCost}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                        </>
                        )}
                     </div>
                 )}

                 {(gameState.phase === 'battle_support' || gameState.phase === 'battle_reveal') && (
                     <div className="flex flex-col gap-4">
                        <div className="bg-black/80 p-2 text-white text-xs border border-white uppercase flex items-center justify-between gap-4">
                            <span>
                                {gameState.phase === 'battle_reveal'
                                    ? 'Revealing support...'
                                    : 'Battle: Lock a Support card (or none).'}
                            </span>
                            {gameState.player.supportLocked && gameState.phase === 'battle_support' && (
                                <span className="text-white/50">LOCKED</span>
                            )}
                        </div>
                        <div className="flex gap-2">
                             <button onClick={() => handleSupportChoice(null)} disabled={!!gameState.player.supportLocked} className="pointer-events-auto bg-slate-800 text-white p-4 disabled:opacity-40">NO SUPPORT</button>
                             {gameState.player.hand.map(c => (
                                 <div key={c.id} onClick={() => handleSupportChoice(c.id)} className={`pointer-events-auto cursor-pointer group relative ${gameState.player.supportLocked ? 'opacity-40 pointer-events-none' : ''}`}>
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
                            {(() => {
                                const h = hoveredCard.attacks ?? DEFAULT_CARD_ATTACKS;
                                return [
                                    { type: 'circle' as const, color: 'ps-red', data: h.circle },
                                    { type: 'triangle' as const, color: 'ps-blue', data: h.triangle },
                                    { type: 'cross' as const, color: 'ps-yellow', data: h.cross }
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
                            ));
                            })()}
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
            
            {gameState.phase === 'victory' && !vfx.isAnimating && (
                <div className="fixed inset-0 bg-black/90 z-[200] flex items-center justify-center">
                    <div className="text-center">
                        <h1 className="text-8xl font-black text-ps-yellow italic mb-8">
                            {gameState.winnerSessionId === (room as any).sessionId ? "BATTLE WON" : "BATTLE LOST"}
                        </h1>
                        {gameState.loserReason && (
                            <div className="text-white/40 text-xs font-mono mb-6 uppercase">
                                {String(gameState.loserReason).replace("_", " ")}
                            </div>
                        )}
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
