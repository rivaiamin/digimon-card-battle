import { Room } from "colyseus.js";
import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { DigimonCard } from "./Card";
import { BattleHUD } from "./BattleHUD";
import { DEFAULT_CARD_ATTACKS } from "../constants";
import { GameState, DigimonCardData, PlayerState, CardKind, EffectArgs } from "../types";
import { getAllCards } from "../services/cardService";
import { BattleStateSchema } from "../schema/BattleState";
import { useAudio } from "../context/AudioProvider";
import { useBattleAudio } from "../hooks/useBattleAudio";
import { useBattleVfx } from "../hooks/useBattleVfx";
import { usePhaseTimerCritical } from "../hooks/usePhaseTimerCritical";
import { ImpactFlash } from "./battle/ImpactFlash";
import { DamagePopups } from "./battle/DamagePopups";
import { SupportZone } from "./battle/SupportZone";
import { MatchHeader } from "./battle/MatchHeader";
import { AttackRevealOverlay } from "./battle/AttackRevealOverlay";
import { AttackStrikePanel } from "./battle/AttackStrikePanel";
import { BattleRevealVignette } from "./battle/BattleRevealVignette";
import { PlayerHandZone, type HandCardAction } from "./battle/PlayerHandZone";
import type { HandInteractionContext } from "../lib/handCardInteraction";
import { useDrawPhaseBeat } from "../hooks/useDrawPhaseBeat";
import { validateDeployDigimon } from "../lib/openingFlow";
import { getRuleProfile } from "../lib/ruleProfile";
import { getBattleRole, shouldShowFlashMessage } from "../lib/battleRoles";
import { canLockSupport } from "../lib/supportPhase";
import { canPlayEvolutionOption } from "../lib/optionEligibility";
import { parseEvolutionModifiers } from "../lib/optionResolver";

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

const normalizeCardKind = (rawKind: unknown): CardKind => {
    if (rawKind === "option" || rawKind === "evolution_option" || rawKind === "digimon") {
        return rawKind;
    }
    return "digimon";
};

const parseEffectArgs = (rawJson: unknown): EffectArgs | undefined => {
    if (typeof rawJson !== "string" || rawJson.trim().length === 0) return undefined;
    try {
        const parsed = JSON.parse(rawJson);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return undefined;
        return parsed as EffectArgs;
    } catch {
        return undefined;
    }
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
        cardKind: normalizeCardKind(c.cardKind),
        effectId: typeof c.effectId === "string" && c.effectId.length > 0 ? c.effectId : undefined,
        effectArgs: parseEffectArgs(c.effectArgsJson),
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
        mulligansRemaining: schema.mulligansRemaining ?? 0,
        needsOpeningDeploy: schema.needsOpeningDeploy ?? false,
        openingPenaltyActive: !!schema.openingPenaltyActive,
        afkStrikes: schema.afkStrikes ?? 0,
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
        activePlayerSessionId: "",
        message: "CONNECTING TO SERVER...",
        prepSubPhase: "",
        hasDiscarded: false,
        winnerSessionId: undefined,
        loserReason: undefined,
    });

    const [hoveredCard, setHoveredCard] = useState<DigimonCardData | null>(null);
    /** Face-down preview of own support until server reveal syncs. */
    const [committedSupport, setCommittedSupport] = useState<DigimonCardData | null>(null);
    const [selectedEvoOptionId, setSelectedEvoOptionId] = useState<string | null>(null);

    const [opponentSessionId, setOpponentSessionId] = useState("");

    const commitDrawPhase = useCallback(() => {
        audio.playSfx("chime");
        room.send("action", { type: "DRAW" });
    }, [audio, room]);

    const handCardIds = gameState.player.hand.map(c => c.id);
    const drawBeat = useDrawPhaseBeat(
        gameState.phase,
        gameState.isPlayerTurn,
        handCardIds,
        commitDrawPhase
    );

    useBattleAudio(gameState, room.sessionId);
    const vfx = useBattleVfx(gameState, room.sessionId, opponentSessionId);
    const timerCritical = usePhaseTimerCritical(gameState.phaseEndsAtMs);

    const suppressMessageOverlay =
        vfx.reveal.active ||
        (vfx.isAnimating && !vfx.koMessage) ||
        gameState.phase === "battle_reveal" ||
        !shouldShowFlashMessage(gameState.message, gameState.phase);

    /** Defender (non-active player) reveals support first during battle_reveal. */
    const playerRevealOrder: "first" | "second" | null =
        gameState.phase === "battle_reveal"
            ? gameState.isPlayerTurn
                ? "second"
                : "first"
            : null;
    const opponentRevealOrder: "first" | "second" | null =
        gameState.phase === "battle_reveal"
            ? gameState.isPlayerTurn
                ? "first"
                : "second"
            : null;

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

            setOpponentSessionId(opponentSessionId ?? "");

            setGameState(prev => ({
                ...prev,
                player: mapSchemaToPlayerState(me),
                opponent: mapSchemaToPlayerState(opponent),
                phase: state.phase as any,
                turn: state.turn,
                isPlayerTurn: state.activePlayerSessionId === room.sessionId,
                activePlayerSessionId: state.activePlayerSessionId ?? "",
                message: state.message,
                prepSubPhase: (
                    state.prepSubPhase === "discard" ||
                    state.prepSubPhase === "evolve" ||
                    state.prepSubPhase === "mulligan" ||
                    state.prepSubPhase === "deploy"
                        ? state.prepSubPhase
                        : ""
                ) as GameState["prepSubPhase"],
                ruleProfileId: state.ruleProfileId ?? "fidelity_ps1",
                arenaVariantId: state.arenaVariantId ?? "standard",
                supportPickSessionId: state.supportPickSessionId ?? "",
                phaseEndsAtMs: state.phaseEndsAtMs ?? 0,
                combatStrikesJson: state.combatStrikesJson ?? "",
                lastBattleAttackerSessionId: state.lastBattleAttackerSessionId ?? "",
                hasDiscarded: state.prepSubPhase === "evolve",
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

    const handleDigForDeploy = () => {
        audio.playSfx("chime");
        room.send("action", { type: "DIG_FOR_DEPLOY" });
    };

    const handleDiscardForDP = (cardId: string) => {
        audio.playSfx("thud", { spatial: "player" });
        room.send("action", { type: "DISCARD_FOR_DP", cardIds: [cardId] });
    };

    const handleDeployDigimon = (cardId: string) => {
        room.send("action", { type: "DEPLOY_DIGIMON", cardId });
    };

    const handleMulligan = () => {
        audio.playSfx("menu_click");
        room.send("action", { type: "MULLIGAN" });
    };

    const handleAcceptHand = () => {
        audio.playSfx("menu_click");
        room.send("action", { type: "ACCEPT_HAND" });
    };

    const ruleProfile = getRuleProfile(
        (gameState.ruleProfileId === "legacy_online" ? "legacy_online" : "fidelity_ps1")
    );

    const deployableHandCards = gameState.player.hand.filter(c => {
        const result = validateDeployDigimon(
            c,
            ruleProfile,
            !!gameState.player.needsOpeningDeploy
        );
        return result.ok;
    });

    const evolutionOptionCards = gameState.player.hand.filter(c =>
        canPlayEvolutionOption(
            { cardKind: c.cardKind, effectId: c.effectId ?? "" },
            gameState.prepSubPhase,
            !!gameState.player.active
        )
    );

    const selectedEvoOption = selectedEvoOptionId
        ? gameState.player.hand.find(c => c.id === selectedEvoOptionId) ?? null
        : null;
    const evoModifiers = selectedEvoOption
        ? parseEvolutionModifiers({
              id: selectedEvoOption.id,
              cardKind: selectedEvoOption.cardKind,
              effectId: selectedEvoOption.effectId ?? "",
              effectArgs: selectedEvoOption.effectArgs,
          })
        : parseEvolutionModifiers(null);

    const canPickSupport =
        gameState.phase === "battle_support" &&
        canLockSupport(
            room.sessionId,
            gameState.supportPickSessionId ?? "",
            ruleProfile.battle.supportPickDefenderFirst,
            !!gameState.player.supportLocked
        );

    const yourBattleRole = gameState.activePlayerSessionId
        ? getBattleRole(room.sessionId, gameState.activePlayerSessionId)
        : null;

    const supportPhaseHint = (() => {
        if (gameState.phase !== "battle_support") return "";
        if (gameState.player.supportLocked) return "Support locked.";
        if (ruleProfile.battle.supportPickDefenderFirst && gameState.supportPickSessionId) {
            if (gameState.supportPickSessionId === room.sessionId) {
                return yourBattleRole === "defender"
                    ? "Your pick — support first."
                    : "Your pick — support.";
            }
            return "Waiting for opponent.";
        }
        return "Pick support or pass.";
    })();

    const handleEvolution = (cardId: string) => {
        room.send("action", {
            type: "EVOLVE",
            cardId,
            evolutionOptionCardId: selectedEvoOptionId ?? undefined,
        });
        setSelectedEvoOptionId(null);
    };

    const handlePlayPrepOption = (cardId: string) => {
        audio.playSfx("thud", { spatial: "player" });
        room.send("action", { type: "PLAY_PREP_OPTION", cardId });
    };

    const handleEndDiscard = () => {
        audio.playSfx("menu_click");
        room.send("action", { type: "END_DISCARD" });
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

    const handInteractionContext: HandInteractionContext = {
        phase: gameState.phase,
        prepSubPhase: gameState.prepSubPhase,
        isYourTurn: gameState.isPlayerTurn,
        hasActive: !!gameState.player.active,
        playerDp: gameState.player.dp,
        activeDigimon: gameState.player.active,
        selectedEvoOptionId,
        evoModifiers,
        canPickSupport,
        supportLocked: !!gameState.player.supportLocked,
        ruleProfile,
        needsOpeningDeploy: !!gameState.player.needsOpeningDeploy,
        selectedEvoOption,
    };

    const handleHandCardAction = (action: HandCardAction) => {
        switch (action.type) {
            case "deploy":
                handleDeployDigimon(action.cardId);
                break;
            case "discard":
                handleDiscardForDP(action.cardId);
                break;
            case "prep_option":
                handlePlayPrepOption(action.cardId);
                break;
            case "evolve":
                handleEvolution(action.cardId);
                break;
            case "toggle_evo_option":
                setSelectedEvoOptionId(prev =>
                    prev === action.cardId ? null : action.cardId
                );
                break;
            case "support":
                handleSupportChoice(action.cardId);
                break;
        }
    };

    let handPhaseActionsFooter: React.ReactNode = null;

    const handPhaseActions = (() => {
        if (gameState.phase === "preparation" && gameState.prepSubPhase === "mulligan" && gameState.isPlayerTurn) {
            return (
                <>
                    <button
                        onClick={handleAcceptHand}
                        className="bg-ps-green text-black hover:bg-surface-strong"
                    >
                        KEEP HAND
                    </button>
                    {(gameState.player.mulligansRemaining ?? 0) > 0 && (
                        <button
                            onClick={handleMulligan}
                            className="bg-ps-yellow text-black hover:bg-surface-strong"
                        >
                            Mulligan ({gameState.player.mulligansRemaining})
                        </button>
                    )}
                </>
            );
        }

        if (
            gameState.phase === "preparation" &&
            gameState.prepSubPhase === "deploy" &&
            !gameState.player.active &&
            gameState.isPlayerTurn &&
            deployableHandCards.length === 0
        ) {
            return (
                <button
                    onClick={handleDigForDeploy}
                    className="bg-ps-yellow text-black hover:bg-surface-strong"
                >
                    DIG DECK
                </button>
            );
        }

        if (
            gameState.phase === "preparation" &&
            gameState.prepSubPhase === "discard" &&
            gameState.player.active
        ) {
            return (
                <>
                    <span className="text-xs font-semibold text-muted tabular-nums px-1">
                        {gameState.player.dp} DP
                    </span>
                    {gameState.isPlayerTurn && (
                        <button
                            onClick={handleEndDiscard}
                            className="bg-ps-red text-white hover:bg-surface-strong hover:text-ps-red"
                        >
                            DONE DISCARDING
                        </button>
                    )}
                </>
            );
        }

        if (
            gameState.phase === "preparation" &&
            gameState.prepSubPhase === "evolve" &&
            gameState.player.active
        ) {
            if (gameState.isPlayerTurn && evolutionOptionCards.length > 0) {
                handPhaseActionsFooter = (
                    <span className="text-[10px] text-ps-blue uppercase font-black">
                        Digivolve options (optional)
                        {selectedEvoOptionId ? " — pick evolution target" : ""}
                    </span>
                );
            }
            return (
                <>
                    <span className="text-xs font-semibold text-muted tabular-nums px-1">
                        {gameState.player.dp} DP
                    </span>
                    {gameState.isPlayerTurn && (
                        <button
                            onClick={handleEndPrep}
                            className="bg-ps-yellow text-black hover:bg-surface-strong"
                        >
                            End prep
                        </button>
                    )}
                </>
            );
        }

        if (gameState.phase === "battle_support" && !gameState.player.supportLocked) {
            return (
                <button
                    onClick={() => handleSupportChoice(null)}
                    disabled={!canPickSupport}
                    className="bg-panel text-fg border-line disabled:opacity-40"
                >
                    NO SUPPORT
                </button>
            );
        }

        return null;
    })();

    if (gameState.phase === 'waiting') {
        return (
            <div className="w-screen h-screen bg-app flex flex-col items-center justify-center">
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
                <div className="mt-8 text-muted text-sm font-mono animate-pulse">
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
            <div className="w-screen h-screen bg-app flex flex-col items-center justify-center">
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
                <div className="mt-8 text-muted text-sm font-mono animate-pulse">
                    LOADING FIELD DATA...
                </div>
            </div>
        );
    }

    return (
        <div className={`relative w-screen h-screen overflow-hidden bg-app text-fg flex items-center justify-center perspective-stage pb-36 ${timerCritical ? "timer-critical-shake" : ""}`}>
            <div className="scanlines" />

            <BattleRevealVignette
                visible={vfx.reveal.stage === "support"}
                label="SUPPORT REVEAL"
            />
            <AttackRevealOverlay
                visible={vfx.reveal.stage === "attacks"}
                playerAttack={vfx.reveal.playerAttack}
                opponentAttack={vfx.reveal.opponentAttack}
            />

            {!suppressMessageOverlay && gameState.message && (
            <div className="absolute top-[28%] left-0 w-full flex justify-center z-[70] pointer-events-none px-4">
                <motion.div 
                    key={gameState.message}
                    initial={{ scale: 1.05, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-ps-blue/95 px-8 py-3 rounded border border-fg/20 shadow-lg max-w-lg"
                >
                    <span className="text-xl font-bold text-white text-center block text-balance">
                        {gameState.message}
                    </span>
                </motion.div>
            </div>
            )}

            {vfx.koMessage && vfx.phase === "ko_beat" && (
            <div className="absolute top-[28%] left-0 w-full flex justify-center z-[75] pointer-events-none px-4">
                <motion.div
                    key={vfx.koMessage}
                    initial={{ scale: 1.1, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="bg-surface-strong px-8 py-3 rounded border-2 border-ps-red shadow-lg max-w-lg"
                >
                    <span className="text-xl font-bold text-fg text-center block text-balance">
                        {vfx.koMessage}
                    </span>
                </motion.div>
            </div>
            )}

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
                        <motion.div className="bg-ps-blue border-y-4 border-fg px-16 py-2 skew-x-[-18deg] shadow-[0_0_40px_rgba(60,155,255,0.6)]">
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
                    duration: vfx.phase === "impact" ? 0.56 : vfx.isAnimating ? 0.7 : 0.8,
                    ease: vfx.phase === "impact" ? "easeOut" : "easeInOut",
                }}
                className="relative w-[200vw] h-[200vh] bg-app flex items-center justify-center arena-surface digital-grid"
            >
                {/* 3D Battle Elements */}
                <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex justify-center gap-64 h-96 items-center">
                    {/* Player Area */}
                    <div className="relative" style={{ transform: "rotateX(-45deg)" }}>
                        {playerActive && (
                            <DigimonCard 
                                data={{...playerActive, hp: displayPlayerHp}} 
                                isRaised={vfx.playerRaised}
                                isAttacking={vfx.playerAttacking}
                                isHit={vfx.playerHit}
                                isKo={vfx.phase === "ko_beat" && vfx.koSide === "player"}
                                onHover={setHoveredCard}
                            />
                        )}
                        <AttackStrikePanel
                            strike={vfx.activeStrikeSide === "player" ? vfx.activeStrike : null}
                            side="player"
                            visible={vfx.activeStrikeSide === "player" && vfx.phase === "raise"}
                        />
                        <SupportZone
                            side="player"
                            phase={gameState.phase}
                            supportCard={gameState.player.supportCard}
                            supportLocked={!!gameState.player.supportLocked}
                            committedFaceDown={committedSupport}
                            revealOrder={playerRevealOrder}
                            onHover={setHoveredCard}
                        />
                    </div>

                    {/* Opponent Area */}
                    <div className="relative" style={{ transform: "rotateX(-45deg)" }}>
                        {opponentActive && (
                            <DigimonCard 
                                data={{...opponentActive, hp: displayOpponentHp}} 
                                isOpponent 
                                isRaised={vfx.opponentRaised}
                                isAttacking={vfx.opponentAttacking}
                                isHit={vfx.opponentHit}
                                isKo={vfx.phase === "ko_beat" && vfx.koSide === "opponent"}
                                onHover={setHoveredCard}
                            />
                        )}
                        <AttackStrikePanel
                            strike={vfx.activeStrikeSide === "opponent" ? vfx.activeStrike : null}
                            side="opponent"
                            visible={vfx.activeStrikeSide === "opponent" && vfx.phase === "raise"}
                        />
                        <SupportZone
                            side="opponent"
                            phase={gameState.phase}
                            supportCard={gameState.opponent.supportCard}
                            supportLocked={!!gameState.opponent.supportLocked}
                            revealOrder={opponentRevealOrder}
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

            {/* Persistent hand (PS1-style: always visible, inactive when not playable) */}
            {gameState.phase !== "waiting" && (
                <PlayerHandZone
                    hand={gameState.player.hand}
                    context={handInteractionContext}
                    onCardAction={handleHandCardAction}
                    onHover={setHoveredCard}
                    phaseActions={handPhaseActions}
                    phaseActionsFooter={handPhaseActionsFooter}
                    drawStatus={
                        drawBeat.overlayVisible
                            ? {
                                  visible: drawBeat.overlayVisible,
                                  mode: drawBeat.overlayMode,
                                  handTarget: ruleProfile.handTarget,
                                  cardsLanded: drawBeat.cardsLanded,
                              }
                            : undefined
                    }
                    supportHint={
                        gameState.phase === "battle_support" && !gameState.player.supportLocked
                            ? supportPhaseHint
                            : null
                    }
                    newlyDrawnCardIds={drawBeat.newlyDrawnCardIds}
                />
            )}

            {clickDebug && (
                <div className="fixed bottom-40 left-4 z-[1001] bg-panel p-3 text-muted text-xs border border-line font-mono uppercase pointer-events-none max-w-[320px]">
                    {clickDebug}
                </div>
            )}

            <MatchHeader
                turn={gameState.turn}
                phase={gameState.phase}
                prepSubPhase={gameState.prepSubPhase}
                isYourTurn={gameState.isPlayerTurn}
                yourSessionId={room.sessionId}
                activePlayerSessionId={gameState.activePlayerSessionId ?? ""}
                supportPickDefenderFirst={ruleProfile.battle.supportPickDefenderFirst}
                supportPickSessionId={gameState.supportPickSessionId ?? ""}
                attackLocked={!!gameState.player.attackLocked}
                phaseEndsAtMs={gameState.phaseEndsAtMs ?? 0}
                handTarget={ruleProfile.handTarget}
                playerScore={gameState.player.score}
                opponentScore={gameState.opponent.score}
            />

            {/* CARD DETAIL OVERLAY */}
            <AnimatePresence>
                {hoveredCard && (
                    <motion.div 
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        className="fixed top-24 left-10 z-[150] w-80 bg-surface-strong border-2 border-ps-blue p-5 shadow-[0_0_50px_rgba(60,155,255,0.3)] pointer-events-none"
                    >
                        <div className="flex justify-between items-start mb-4 border-b border-ps-blue/30 pb-2">
                            <div>
                                <h2 className="text-2xl font-black italic text-fg uppercase leading-none">{hoveredCard.name}</h2>
                                <span className="text-xs font-bold text-ps-blue">{hoveredCard.level.toUpperCase()} / {hoveredCard.type.toUpperCase()}</span>
                            </div>
                            <div className="bg-ps-blue/20 p-2 border border-ps-blue/50">
                                <span className="text-xl font-black text-ps-blue leading-none">{hoveredCard.hp}</span>
                                <span className="text-xs block text-muted">HP</span>
                            </div>
                        </div>

                        {/* SUPPORT EFFECT (HIGH PRIORITY) */}
                        {hoveredCard.supportEffect && (
                            <div className="mb-6 bg-ps-blue/10 border border-ps-blue/40 p-3">
                                <div className="text-xs font-black text-ps-blue uppercase mb-1 tracking-widest flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-ps-blue animate-pulse" />
                                    Support Effect
                                </div>
                                <p className="text-sm font-bold text-fg leading-relaxed">
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
                                    <p className="text-xs text-muted leading-tight">
                                        {atk.data.description || "Standard damage attack."}
                                    </p>
                                </div>
                            ));
                            })()}
                        </div>

                        {/* EVO INFO */}
                        <div className="mt-6 flex justify-between pt-2 border-t border-line text-xs font-bold">
                            <div className="flex flex-col">
                                <span className="text-muted uppercase">Evo Cost</span>
                                <span className="text-ps-blue">{hoveredCard.evoCost} DP</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-muted uppercase">Plus DP</span>
                                <span className="text-ps-yellow">+{hoveredCard.plusDp}</span>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            
            {gameState.phase === 'victory' && !vfx.isAnimating && (
                <div className="fixed inset-0 bg-overlay z-[200] flex items-center justify-center">
                    <div className="text-center">
                        <h1 className="text-8xl font-black text-ps-yellow italic mb-8">
                            {gameState.winnerSessionId === (room as any).sessionId ? "BATTLE WON" : "BATTLE LOST"}
                        </h1>
                        {gameState.loserReason && (
                            <div className="text-muted text-sm font-mono mb-6 uppercase">
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
