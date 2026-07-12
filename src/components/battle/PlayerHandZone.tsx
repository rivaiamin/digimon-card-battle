import React, { useRef } from "react";
import { DigimonCard } from "../Card";
import { HandDrawStatus } from "./HandDrawStatus";
import { HandMulliganStatus } from "./HandMulliganStatus";
import { HandDiscardStatus } from "./HandDiscardStatus";
import { HandPrepOptionStatus } from "./HandPrepOptionStatus";
import type { DrawOverlayMode } from "../../hooks/useDrawPhaseBeat";
import type { MulliganOverlayMode } from "../../hooks/useMulliganBeat";
import {
    getHandCardInteraction,
    type HandCardInteraction,
    type HandInteractionContext,
} from "../../lib/handCardInteraction";
import type { DigimonCardData } from "../../types";

export type HandCardAction =
    | { type: "deploy"; cardId: string }
    | { type: "discard"; cardId: string }
    | { type: "prep_option"; cardId: string }
    | { type: "evolve"; cardId: string }
    | { type: "toggle_evo_option"; cardId: string }
    | { type: "support"; cardId: string };

type DrawStatusProps = {
    visible: boolean;
    mode: DrawOverlayMode;
    handTarget: number;
    cardsLanded: number;
};

type MulliganStatusProps = {
    visible: boolean;
    mode: MulliganOverlayMode;
    mulligansRemaining: number;
    cardsLanded: number;
};

type DiscardStatusProps = {
    visible: boolean;
    playerDp: number;
    lastDpGain: number;
    isYourTurn: boolean;
};

type PrepOptionStatusProps = {
    visible: boolean;
    feedback: string | null;
    isYourTurn: boolean;
};

type PlayerHandZoneProps = {
    hand: DigimonCardData[];
    context: HandInteractionContext;
    onCardAction: (action: HandCardAction) => void;
    onHover: (card: DigimonCardData | null) => void;
    /** Mobile long-press / tap-to-inspect (desktop still uses hover). */
    onPreview?: (card: DigimonCardData) => void;
    phaseActions?: React.ReactNode;
    phaseActionsFooter?: React.ReactNode;
    supportHint?: string | null;
    newlyDrawnCardIds?: Set<string>;
    drawStatus?: DrawStatusProps;
    mulliganStatus?: MulliganStatusProps;
    discardStatus?: DiscardStatusProps;
    prepOptionStatus?: PrepOptionStatusProps;
    /** Tighter chrome while attack picker / field-active layout is up */
    compact?: boolean;
};

const PREVIEW_LONG_PRESS_MS = 420;

function handleCardClick(
    card: DigimonCardData,
    interaction: HandCardInteraction,
    onCardAction: (action: HandCardAction) => void
) {
    if (!interaction.enabled) return;
    switch (interaction.mode) {
        case "deploy":
            onCardAction({ type: "deploy", cardId: card.id });
            break;
        case "discard":
            onCardAction({ type: "discard", cardId: card.id });
            break;
        case "prep_option":
            onCardAction({ type: "prep_option", cardId: card.id });
            break;
        case "evolve_target":
            onCardAction({ type: "evolve", cardId: card.id });
            break;
        case "evolve_option":
            onCardAction({ type: "toggle_evo_option", cardId: card.id });
            break;
        case "support":
            onCardAction({ type: "support", cardId: card.id });
            break;
    }
}

export const PlayerHandZone: React.FC<PlayerHandZoneProps> = ({
    hand,
    context,
    onCardAction,
    onHover,
    onPreview,
    phaseActions,
    phaseActionsFooter,
    supportHint,
    newlyDrawnCardIds,
    drawStatus,
    mulliganStatus,
    discardStatus,
    prepOptionStatus,
    compact = false,
}) => {
    const longPressRef = useRef<{
        timer: number | null;
        didPreview: boolean;
    }>({ timer: null, didPreview: false });

    const clearLongPress = () => {
        if (longPressRef.current.timer != null) {
            window.clearTimeout(longPressRef.current.timer);
            longPressRef.current.timer = null;
        }
    };

    const showBar =
        hand.length > 0 ||
        phaseActions ||
        phaseActionsFooter ||
        drawStatus?.visible ||
        mulliganStatus?.visible ||
        discardStatus?.visible ||
        prepOptionStatus?.visible;

    if (!showBar) return null;

    // Status chips already cover mulligan/draw copy — skip duplicate footer text
    const showFooterHint = !!(
        supportHint ||
        (phaseActionsFooter &&
            !mulliganStatus?.visible &&
            !drawStatus?.visible &&
            !discardStatus?.visible)
    );

    return (
        <div
            className={`fixed bottom-0 inset-x-0 z-[900] pointer-events-none flex flex-col items-center px-2 pb-[max(0.35rem,env(safe-area-inset-bottom))] sm:px-3 ${
                compact ? "battle-hand--compact" : ""
            }`}
        >
            <div
                className={`pointer-events-auto w-full max-w-3xl rounded-2xl bg-panel/92 ring-1 ring-line backdrop-blur-md battle-hand-island ${
                    compact ? "p-1" : "p-1.5"
                }`}
            >
                <div
                    className={`rounded-[calc(1rem-0.2rem)] bg-surface-strong/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.28)] ${
                        compact ? "px-2 py-1" : "px-2.5 py-1.5"
                    }`}
                >
                    <div className="flex min-w-0 items-center gap-2">
                        <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto scrollbar-thin">
                            <span className="shrink-0 text-[10px] font-black uppercase tracking-[0.18em] text-muted">
                                Hand ({hand.length})
                            </span>
                            {drawStatus && (
                                <HandDrawStatus
                                    visible={drawStatus.visible}
                                    mode={drawStatus.mode}
                                    handTarget={drawStatus.handTarget}
                                    cardsLanded={drawStatus.cardsLanded}
                                />
                            )}
                            {mulliganStatus && (
                                <HandMulliganStatus
                                    visible={mulliganStatus.visible}
                                    mode={mulliganStatus.mode}
                                    mulligansRemaining={mulliganStatus.mulligansRemaining}
                                    cardsLanded={mulliganStatus.cardsLanded}
                                />
                            )}
                            {discardStatus && (
                                <HandDiscardStatus
                                    visible={discardStatus.visible}
                                    playerDp={discardStatus.playerDp}
                                    lastDpGain={discardStatus.lastDpGain}
                                    isYourTurn={discardStatus.isYourTurn}
                                />
                            )}
                            {prepOptionStatus && (
                                <HandPrepOptionStatus
                                    visible={prepOptionStatus.visible}
                                    feedback={prepOptionStatus.feedback}
                                    isYourTurn={prepOptionStatus.isYourTurn}
                                />
                            )}
                        </div>
                        {phaseActions}
                    </div>

                    {showFooterHint && (
                        <div className="mt-1 overflow-x-auto scrollbar-thin">
                            <div className="min-w-0 text-center whitespace-nowrap sm:whitespace-normal">
                                {supportHint && (
                                    <p className="inline text-[10px] text-muted leading-snug">
                                        {supportHint}
                                    </p>
                                )}
                                {phaseActionsFooter}
                            </div>
                        </div>
                    )}

                    {hand.length > 0 && (
                        <div className="mt-1.5 flex w-full justify-start sm:justify-center gap-1.5 overflow-x-auto overflow-y-visible px-0.5 pb-0.5 scrollbar-thin sm:gap-2">
                            {hand.map(card => {
                                const interaction = getHandCardInteraction(card, context);
                                const dimmed = interaction.mode === "inactive";
                                const clickable = interaction.enabled;
                                const isNewlyDrawn = newlyDrawnCardIds?.has(card.id) ?? false;
                                const newCardIndex = isNewlyDrawn
                                    ? hand
                                          .filter(c => newlyDrawnCardIds?.has(c.id))
                                          .findIndex(c => c.id === card.id)
                                    : 0;

                                return (
                                    <div
                                        key={card.id}
                                        style={{ overflow: "visible" }}
                                        onClick={() => {
                                            if (longPressRef.current.didPreview) {
                                                longPressRef.current.didPreview = false;
                                                return;
                                            }
                                            if (clickable) {
                                                handleCardClick(card, interaction, onCardAction);
                                            } else {
                                                onPreview?.(card);
                                            }
                                        }}
                                        onPointerDown={e => {
                                            if (e.pointerType === "mouse") return;
                                            clearLongPress();
                                            longPressRef.current.didPreview = false;
                                            longPressRef.current.timer = window.setTimeout(() => {
                                                longPressRef.current.didPreview = true;
                                                longPressRef.current.timer = null;
                                                onPreview?.(card);
                                            }, PREVIEW_LONG_PRESS_MS);
                                        }}
                                        onPointerUp={clearLongPress}
                                        onPointerCancel={clearLongPress}
                                        onPointerLeave={clearLongPress}
                                        onMouseEnter={() => onHover(card)}
                                        onMouseLeave={() => onHover(null)}
                                        className={`relative shrink-0 rounded transition-opacity duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] touch-manipulation ${
                                            dimmed ? "opacity-45" : "opacity-100"
                                        } ${clickable ? "cursor-pointer" : "cursor-default"} ${
                                            interaction.ringClass
                                        } ${
                                            isNewlyDrawn
                                                ? "ring-2 ring-ps-green/70 ring-offset-2 ring-offset-app"
                                                : ""
                                        }`}
                                    >
                                        <DigimonCard
                                            data={card}
                                            variant="mini"
                                            miniEnter={isNewlyDrawn ? "from-deck" : "none"}
                                            delay={isNewlyDrawn ? newCardIndex * 0.1 : 0}
                                            onHover={undefined}
                                        />
                                        {interaction.badge && (
                                            <div
                                                className={`text-[9px] font-black text-center px-0.5 leading-tight ${
                                                    interaction.mode === "deploy"
                                                        ? "bg-ps-green text-black"
                                                        : interaction.mode === "prep_option"
                                                          ? "bg-ps-yellow text-black"
                                                          : interaction.mode ===
                                                                  "evolve_option" ||
                                                              interaction.mode === "evolve_target"
                                                            ? "bg-ps-blue text-white"
                                                            : interaction.mode === "support"
                                                              ? "bg-panel text-fg border border-line"
                                                              : interaction.mode === "discard"
                                                                ? "bg-ps-red/90 text-white"
                                                                : "bg-panel text-muted"
                                                }`}
                                            >
                                                {interaction.badge}
                                            </div>
                                        )}
                                        {interaction.statusHint && (
                                            <div className="text-[9px] font-bold text-ps-red text-center leading-none">
                                                {interaction.statusHint}
                                            </div>
                                        )}
                                        {interaction.mode === "discard" &&
                                            interaction.enabled && (
                                                <div className="absolute inset-0 bg-ps-red/0 hover:bg-ps-red/75 flex items-center justify-center text-white text-[9px] font-bold text-center p-1 opacity-0 hover:opacity-100 transition-opacity rounded pointer-events-none sm:flex">
                                                    DISCARD
                                                    <br />
                                                    (+{card.plusDp} DP)
                                                </div>
                                            )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
