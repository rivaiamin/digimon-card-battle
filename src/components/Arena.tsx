import { Room } from "colyseus.js";
import React, { useState, useEffect, useCallback, useMemo } from "react";
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
import { EvolutionBeat } from "./battle/EvolutionBeat";
import { DamagePopups } from "./battle/DamagePopups";
import { SupportZone } from "./battle/SupportZone";
import { MatchHeader } from "./battle/MatchHeader";
import { CardPreviewPanel } from "./battle/CardPreviewPanel";
import { AttackRevealOverlay } from "./battle/AttackRevealOverlay";
import { AttackStrikePanel } from "./battle/AttackStrikePanel";
import { BattleRevealVignette } from "./battle/BattleRevealVignette";
import { PlayerHandZone, type HandCardAction } from "./battle/PlayerHandZone";
import type { HandInteractionContext } from "../lib/handCardInteraction";
import { useDrawPhaseBeat } from "../hooks/useDrawPhaseBeat";
import { useMulliganBeat } from "../hooks/useMulliganBeat";
import { useDiscardDpBeat } from "../hooks/useDiscardDpBeat";
import { usePrepOptionBeat, type PrepOptionPlayRequest } from "../hooks/usePrepOptionBeat";
import { useEvolutionVfx } from "../hooks/useEvolutionVfx";
import { validateDeployDigimon } from "../lib/openingFlow";
import { getRuleProfile } from "../lib/ruleProfile";
import { getBattleRole, shouldShowFlashMessage } from "../lib/battleRoles";
import { canLockSupport } from "../lib/supportPhase";
import { canPlayEvolutionOption } from "../lib/optionEligibility";
import { parseEvolutionModifiers } from "../lib/optionResolver";
import { parseStatusAilmentsJson } from "../lib/postEvolutionRecovery";
import {
    getPrepHandFooter,
    getPrepPrimaryActionLabel,
    getPrepSecondaryActionLabel,
} from "../lib/prepPhaseCopy";
import { VictoryOverlay } from "./battle/VictoryOverlay";

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
    attackLocked: false,
    statusAilments: [],
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
    attackLocked: false,
    statusAilments: [],
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
                  requireOpponentType: c.supportEffect.requireOpponentType || undefined,
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
        statusAilments: parseStatusAilmentsJson(schema.statusAilmentsJson),
        afkStrikes: schema.afkStrikes ?? 0,
        connected: schema.connected !== false,
    };
};

type ArenaProps = {
    room: Room<BattleStateSchema>;
    onReturnToWorldMap: () => void;
    /** Unexpected leave — App may attempt FC-024 reconnect. */
    onRoomLeft?: (code: number, reconnectionToken: string) => void;
};

export const Arena: React.FC<ArenaProps> = ({ room, onReturnToWorldMap, onRoomLeft }) => {
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
    const [previewCard, setPreviewCard] = useState<DigimonCardData | null>(null);
    /** Face-down preview of own support until server reveal syncs. */
    const [committedSupport, setCommittedSupport] = useState<DigimonCardData | null>(null);
    const [committedEmptySupport, setCommittedEmptySupport] = useState(false);
    const [committedGambleSupport, setCommittedGambleSupport] = useState(false);
    const [selectedEvoOptionId, setSelectedEvoOptionId] = useState<string | null>(null);
    const [mulliganRequestTick, setMulliganRequestTick] = useState(0);
    const [prepOptionRequestTick, setPrepOptionRequestTick] = useState(0);
    const [prepOptionPlayRequest, setPrepOptionPlayRequest] = useState<PrepOptionPlayRequest | null>(null);

    const [opponentSessionId, setOpponentSessionId] = useState("");

    // Attack picker is the focus — drop the card inspector so it doesn't steal the column.
    useEffect(() => {
        if (gameState.phase === "battle_attack") {
            setHoveredCard(null);
            setPreviewCard(null);
        }
    }, [gameState.phase]);

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

    const mulliganBeat = useMulliganBeat(
        gameState.phase,
        gameState.prepSubPhase,
        gameState.isPlayerTurn,
        handCardIds,
        mulliganRequestTick
    );

    const discardDpBeat = useDiscardDpBeat(
        gameState.phase,
        gameState.prepSubPhase,
        gameState.isPlayerTurn,
        gameState.player.dp,
        handCardIds
    );

    const prepOptionBeat = usePrepOptionBeat(
        gameState.phase,
        gameState.prepSubPhase,
        gameState.isPlayerTurn,
        gameState.player.dp,
        gameState.player.active?.hp ?? gameState.player.hp,
        handCardIds,
        prepOptionPlayRequest,
        prepOptionRequestTick
    );

    const newlyHighlightedCardIds = useMemo(() => {
        const ids = new Set<string>();
        drawBeat.newlyDrawnCardIds.forEach(id => ids.add(id));
        mulliganBeat.newlyMulliganedCardIds.forEach(id => ids.add(id));
        return ids;
    }, [drawBeat.newlyDrawnCardIds, mulliganBeat.newlyMulliganedCardIds]);

    const playEvolveSfx = useCallback(
        (side: "player" | "opponent") => {
            audio.playSfx("evolve", { spatial: side === "player" ? "player" : "enemy" });
        },
        [audio]
    );

    const evolutionVfx = useEvolutionVfx(
        {
            activeId: gameState.player.active?.id ?? null,
            stackLen: gameState.player.evolutionStack.length,
        },
        {
            activeId: gameState.opponent.active?.id ?? null,
            stackLen: gameState.opponent.evolutionStack.length,
        },
        playEvolveSfx
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
            const token = room.reconnectionToken ?? "";
            setGameState(prev => ({
                ...prev,
                message: "DISCONNECTED FROM SERVER",
            }));
            onRoomLeft?.(code, token);
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
    }, [room, onRoomLeft]);

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
        audio.playSfx("reward_tick", { spatial: "player" });
        room.send("action", { type: "DISCARD_FOR_DP", cardIds: [cardId] });
    };

    const handleDeployDigimon = (cardId: string) => {
        room.send("action", { type: "DEPLOY_DIGIMON", cardId });
    };

    const handleMulligan = () => {
        audio.playSfx("chime", { spatial: "player" });
        setMulliganRequestTick(t => t + 1);
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
        const card = gameState.player.hand.find(c => c.id === cardId);
        if (card) {
            setPrepOptionPlayRequest({
                cardId: card.id,
                effectId: card.effectId ?? "",
                effectArgs: card.effectArgs,
                name: card.name,
            });
            setPrepOptionRequestTick(t => t + 1);
        }
        audio.playSfx("chime", { spatial: "player" });
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
            setCommittedEmptySupport(false);
            setCommittedGambleSupport(false);
        } else {
            setCommittedSupport(null);
            setCommittedEmptySupport(true);
            setCommittedGambleSupport(false);
        }
        room.send("action", { type: "LOCK_SUPPORT", cardId });
    };

    const handleSupportGamble = () => {
        audio.playSfx("thud", { spatial: "player" });
        setCommittedSupport(null);
        setCommittedEmptySupport(false);
        setCommittedGambleSupport(true);
        room.send("action", { type: "LOCK_SUPPORT", gamble: true });
    };

    useEffect(() => {
        if (gameState.phase !== "battle_support" && gameState.phase !== "battle_reveal") {
            setCommittedSupport(null);
            setCommittedEmptySupport(false);
            setCommittedGambleSupport(false);
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
            handPhaseActionsFooter = (
                <span className="text-[10px] text-muted uppercase font-bold tracking-wide">
                    {getPrepHandFooter("mulligan")}
                </span>
            );
            const redrawsLeft = gameState.player.mulligansRemaining ?? 0;
            return (
                <>
                    <button
                        onClick={handleAcceptHand}
                        disabled={mulliganBeat.isRedrawing}
                        className="bg-ps-green text-black hover:bg-surface-strong disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {getPrepPrimaryActionLabel("mulligan")}
                    </button>
                    {redrawsLeft > 0 && (
                        <button
                            onClick={handleMulligan}
                            disabled={mulliganBeat.isRedrawing}
                            className="bg-ps-yellow text-black hover:bg-surface-strong disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {getPrepSecondaryActionLabel("mulligan")}
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
                    {getPrepSecondaryActionLabel("deploy")}
                </button>
            );
        }

        if (
            gameState.phase === "preparation" &&
            gameState.prepSubPhase === "discard" &&
            gameState.player.active
        ) {
            return (
                gameState.isPlayerTurn && (
                    <button
                        onClick={handleEndDiscard}
                        className="bg-ps-red text-white hover:bg-surface-strong hover:text-ps-red"
                    >
                        {getPrepPrimaryActionLabel("discard")}
                    </button>
                )
            );
        }

        if (
            gameState.phase === "preparation" &&
            gameState.prepSubPhase === "evolve" &&
            gameState.player.active
        ) {
            if (gameState.isPlayerTurn) {
                handPhaseActionsFooter = (
                    <span
                        className={`text-[10px] uppercase tracking-wide ${
                            evolutionOptionCards.length > 0
                                ? "text-ps-blue font-black"
                                : "text-muted font-bold"
                        }`}
                    >
                        {getPrepHandFooter("evolve", {
                            hasEvolutionOptions: evolutionOptionCards.length > 0,
                            evoOptionSelected: !!selectedEvoOptionId,
                        })}
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
                            {getPrepPrimaryActionLabel("evolve")}
                        </button>
                    )}
                </>
            );
        }

        if (gameState.phase === "battle_support" && !gameState.player.supportLocked) {
            const canGamble =
                ruleProfile.battle.allowOnlineDeckGamble &&
                canPickSupport &&
                gameState.player.deck.length > 0;
            handPhaseActionsFooter = null;
            return (
                <>
                    <button
                        onClick={handleSupportGamble}
                        disabled={!canGamble}
                        className="bg-ps-yellow text-black hover:bg-surface-strong disabled:opacity-40"
                    >
                        GAMBLE
                    </button>
                    <button
                        onClick={() => handleSupportChoice(null)}
                        disabled={!canPickSupport}
                        className="bg-panel text-fg border-line disabled:opacity-40"
                    >
                        NO SUPPORT
                    </button>
                </>
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

    const choosingAttack =
        gameState.phase === "battle_attack" &&
        !gameState.player.attackLocked &&
        !!gameState.player.active;

    /** Digimon on field — larger cards + equal margins to phase strip (all phases). */
    const fieldActiveLayout =
        !choosingAttack &&
        !!(gameState.player.active || gameState.opponent.active) &&
        gameState.phase !== "waiting" &&
        gameState.phase !== "victory";

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
        <div className={`relative w-screen h-[100dvh] overflow-hidden bg-app text-fg flex items-center justify-center perspective-stage battle-stage ${choosingAttack ? "battle-stage--choosing-attack" : ""} ${fieldActiveLayout ? "battle-stage--field-active" : ""} ${timerCritical ? "timer-critical-shake" : ""}`}>
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
            <div className="absolute top-[10%] sm:top-[12%] left-0 w-full flex justify-center z-[70] pointer-events-none px-3 sm:px-4">
                <motion.div 
                    key={gameState.message}
                    initial={{ scale: 1.05, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="bg-ps-blue/95 px-4 sm:px-8 py-2 sm:py-3 rounded border border-fg/20 shadow-lg max-w-lg"
                >
                    <span className="text-base sm:text-xl font-bold text-white text-center block text-balance">
                        {gameState.message}
                    </span>
                </motion.div>
            </div>
            )}

            {vfx.koMessage && vfx.phase === "ko_beat" && (
            <div className="absolute top-[10%] sm:top-[12%] left-0 w-full flex justify-center z-[75] pointer-events-none px-3 sm:px-4">
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
            <ImpactFlash color={evolutionVfx.flashColor ?? vfx.flashColor} />
            <EvolutionBeat side={evolutionVfx.label} />
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
                    rotateX: vfx.cameraState === 'attack' ? 22 : vfx.cameraState === 'damage' ? 30 : 28,
                    translateZ: vfx.cameraState === 'attack' ? 100 : vfx.cameraState === 'damage' ? 60 : 0,
                    scale: vfx.cameraState === 'attack' ? 1.18 : vfx.cameraState === 'damage' ? 1.12 : 1.05,
                    x: vfx.phase === "impact" ? [0, -6, 6, -4, 4, 0] : 0,
                }}
                transition={{
                    duration: vfx.phase === "impact" ? 0.56 : vfx.isAnimating ? 0.7 : 0.8,
                    ease: vfx.phase === "impact" ? "easeOut" : "easeInOut",
                }}
                className="relative w-[200vw] h-[200vh] bg-app flex items-center justify-center arena-surface digital-grid"
            >
                {/* Opponent top · center gap (for MatchHeader) · player bottom */}
                <div className="absolute inset-x-0 flex flex-col items-center battle-field-band">
                    <div className="relative battle-field-slot">
                        {opponentActive ? (
                            <DigimonCard 
                                data={{...opponentActive, hp: displayOpponentHp}} 
                                isOpponent 
                                fieldEnter={evolutionVfx.opponentFieldEnter}
                                isRaised={vfx.opponentRaised}
                                isAttacking={vfx.opponentAttacking}
                                isHit={vfx.opponentHit}
                                isKo={vfx.phase === "ko_beat" && vfx.koSide === "opponent"}
                                onHover={setHoveredCard}
                                onInspect={setPreviewCard}
                            />
                        ) : (
                            <div className="battle-field-placeholder battle-field-placeholder--opponent" aria-hidden>
                                <span>Opponent</span>
                            </div>
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

                    <div className="battle-field-center-gap" aria-hidden />

                    <div
                        className={`relative battle-field-slot ${
                            choosingAttack ? "battle-field-slot--lifted" : ""
                        }`}
                    >
                        {playerActive ? (
                            <DigimonCard 
                                data={{...playerActive, hp: displayPlayerHp}} 
                                fieldEnter={evolutionVfx.playerFieldEnter}
                                isRaised={vfx.playerRaised}
                                isAttacking={vfx.playerAttacking}
                                isHit={vfx.playerHit}
                                isKo={vfx.phase === "ko_beat" && vfx.koSide === "player"}
                                onHover={setHoveredCard}
                                onInspect={setPreviewCard}
                            />
                        ) : (
                            <div className="battle-field-placeholder battle-field-placeholder--player" aria-hidden>
                                <span>Your Digimon</span>
                            </div>
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
                            bluffEmpty={committedEmptySupport}
                            bluffGamble={committedGambleSupport}
                            revealOrder={playerRevealOrder}
                            onHover={setHoveredCard}
                        />
                    </div>
                </div>
            </motion.div>

            {/* BATTLE HUD */}
            <BattleHUD 
                state={gameState}
                yourSessionId={room.sessionId}
                player={{
                    active: playerActive,
                    hp: displayPlayerHp,
                    maxHp: playerActive?.maxHp ?? gameState.player.active?.maxHp ?? 0
                }}
                onAttack={handleAttack}
                disabled={
                    vfx.isAnimating ||
                    gameState.phase === 'battle_reveal' ||
                    gameState.phase !== 'battle_attack' ||
                    !!gameState.player.attackLocked
                }
            />

            {gameState.phase !== "victory" &&
                gameState.phase !== "waiting" &&
                gameState.opponent.connected === false && (
                <div className="fixed top-20 inset-x-0 z-[120] flex justify-center pointer-events-none">
                    <span className="text-[10px] font-black uppercase tracking-widest text-ps-yellow bg-surface-strong/90 border border-ps-yellow/40 px-4 py-2">
                        Opponent reconnecting…
                    </span>
                </div>
            )}

            {/* Persistent hand (PS1-style: always visible, inactive when not playable) */}
            {gameState.phase !== "waiting" && (
                <PlayerHandZone
                    hand={gameState.player.hand}
                    context={handInteractionContext}
                    onCardAction={handleHandCardAction}
                    onHover={setHoveredCard}
                    onPreview={setPreviewCard}
                    compact={choosingAttack || fieldActiveLayout}
                    phaseActions={handPhaseActions}
                    phaseActionsFooter={handPhaseActionsFooter}
                    drawStatus={
                        drawBeat.overlayVisible && !mulliganBeat.overlayVisible
                            ? {
                                  visible: drawBeat.overlayVisible,
                                  mode: drawBeat.overlayMode,
                                  handTarget: ruleProfile.handTarget,
                                  cardsLanded: drawBeat.cardsLanded,
                              }
                            : undefined
                    }
                    mulliganStatus={
                        mulliganBeat.overlayVisible
                            ? {
                                  visible: mulliganBeat.overlayVisible,
                                  mode: mulliganBeat.overlayMode,
                                  mulligansRemaining: gameState.player.mulligansRemaining ?? 0,
                                  cardsLanded: mulliganBeat.cardsLanded,
                              }
                            : undefined
                    }
                    discardStatus={
                        discardDpBeat.overlayVisible && !prepOptionBeat.feedback
                            ? {
                                  visible: discardDpBeat.overlayVisible,
                                  playerDp: discardDpBeat.playerDp,
                                  lastDpGain: discardDpBeat.lastDpGain,
                                  isYourTurn: gameState.isPlayerTurn,
                              }
                            : undefined
                    }
                    prepOptionStatus={
                        prepOptionBeat.overlayVisible &&
                        (gameState.prepSubPhase === "evolve" ||
                            gameState.prepSubPhase === "discard" ||
                            prepOptionBeat.feedback)
                            ? {
                                  visible: prepOptionBeat.overlayVisible,
                                  feedback: prepOptionBeat.feedback,
                                  isYourTurn: gameState.isPlayerTurn,
                              }
                            : undefined
                    }
                    supportHint={
                        gameState.phase === "battle_support" && !gameState.player.supportLocked
                            ? supportPhaseHint
                            : null
                    }
                    newlyDrawnCardIds={newlyHighlightedCardIds}
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
                mulligansRemaining={gameState.player.mulligansRemaining ?? 0}
                needsOpeningDeploy={!!gameState.player.needsOpeningDeploy}
                fieldAnchored={!!(playerActive || opponentActive)}
            />

            <CardPreviewPanel
                card={hoveredCard}
                mode="hover"
            />
            <CardPreviewPanel
                card={previewCard}
                mode="sheet"
                onClose={() => setPreviewCard(null)}
            />
            
            {gameState.phase === "battle_support" && gameState.player.supportLocked && (
                <div
                    className="fixed inset-x-0 z-[90] flex justify-center pointer-events-none px-3"
                    style={{ bottom: "var(--battle-hand-clearance)" }}
                >
                    <span className="text-[10px] font-black uppercase tracking-widest text-ps-blue/80 bg-surface-strong/80 border border-ps-blue/30 px-3 py-1 rounded">
                        {committedGambleSupport
                            ? "Deck gamble set — waiting for opponent"
                            : committedEmptySupport
                              ? "Bluff set — waiting for opponent"
                              : "Support set — waiting for opponent"}
                    </span>
                </div>
            )}

            {gameState.phase === "victory" && !vfx.isAnimating && (
                <VictoryOverlay
                    outcome={
                        gameState.winnerSessionId === room.sessionId ? "won" : "lost"
                    }
                    playerScore={gameState.player.score}
                    opponentScore={gameState.opponent.score}
                    loserReason={gameState.loserReason}
                    onReturnToWorldMap={onReturnToWorldMap}
                />
            )}
        </div>
    );
};
