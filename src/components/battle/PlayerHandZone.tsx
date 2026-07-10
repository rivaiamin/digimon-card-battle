import React from "react";
import { DigimonCard } from "../Card";
import { HandDrawStatus } from "./HandDrawStatus";
import type { DrawOverlayMode } from "../../hooks/useDrawPhaseBeat";
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

type PlayerHandZoneProps = {
    hand: DigimonCardData[];
    context: HandInteractionContext;
    onCardAction: (action: HandCardAction) => void;
    onHover: (card: DigimonCardData | null) => void;
    phaseActions?: React.ReactNode;
    phaseActionsFooter?: React.ReactNode;
    supportHint?: string | null;
    newlyDrawnCardIds?: ReadonlySet<string>;
    drawStatus?: DrawStatusProps;
};

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
    phaseActions,
    phaseActionsFooter,
    supportHint,
    newlyDrawnCardIds,
    drawStatus,
}) => {
    const showBar =
        hand.length > 0 || phaseActions || phaseActionsFooter || drawStatus?.visible;

    if (!showBar) return null;

    return (
        <div className="fixed bottom-0 inset-x-0 z-[1000] pointer-events-none flex flex-col items-center">
            <div className="pointer-events-auto w-full border-t border-line bg-panel/95 backdrop-blur-sm px-4 py-3 shadow-[0_-8px_32px_rgba(0,0,0,0.25)]">
                <div className="mx-auto flex w-full max-w-[min(100vw-2rem,64rem)] flex-col gap-2">
                    <div className="flex items-center justify-between gap-3 border-b border-line/40 pb-2">
                        <div className="flex min-w-0 items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-widest text-muted shrink-0">
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
                        </div>
                        {phaseActions && (
                            <div className="flex shrink-0 items-center justify-end gap-2 [&_button]:whitespace-nowrap [&_button]:text-xs [&_button]:font-black [&_button]:px-3 [&_button]:py-1.5 [&_button]:border-2 [&_button]:border-fg">
                                {phaseActions}
                            </div>
                        )}
                    </div>

                    {(supportHint || phaseActionsFooter) && (
                        <div className="flex flex-col items-center gap-1 text-center">
                            {supportHint && (
                                <p className="text-xs text-muted">{supportHint}</p>
                            )}
                            {phaseActionsFooter}
                        </div>
                    )}

                    {hand.length > 0 && (
                        <div className="flex w-full justify-center gap-3 overflow-x-auto overflow-y-visible px-1 pb-1 pt-2 scrollbar-thin">
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
                                        onClick={() =>
                                            handleCardClick(card, interaction, onCardAction)
                                        }
                                        onMouseEnter={() => onHover(card)}
                                        onMouseLeave={() => onHover(null)}
                                        className={`relative shrink-0 rounded transition-opacity ${
                                            dimmed ? "opacity-45" : "opacity-100"
                                        } ${clickable ? "cursor-pointer" : "cursor-default"} ${
                                            interaction.ringClass
                                        } ${
                                            isNewlyDrawn
                                                ? "ring-2 ring-ps-green/70 ring-offset-2 ring-offset-app shadow-[0_0_20px_rgba(34,197,94,0.35)]"
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
                                                className={`text-[10px] font-black text-center px-0.5 leading-tight ${
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
                                            <div className="text-[10px] font-bold text-ps-red text-center leading-none">
                                                {interaction.statusHint}
                                            </div>
                                        )}
                                        {interaction.mode === "discard" &&
                                            interaction.enabled && (
                                                <div className="absolute inset-0 bg-ps-red/0 hover:bg-ps-red/75 flex items-center justify-center text-white text-[10px] font-bold text-center p-1 opacity-0 hover:opacity-100 transition-opacity rounded">
                                                    DISCARD
                                                    <br />
                                                    (+{card.plusDp} DP)
                                                </div>
                                            )}
                                        {interaction.mode === "support" &&
                                            card.supportEffect && (
                                                <div className="absolute inset-x-0 bottom-full mb-1 hidden group-hover:block bg-surface-strong text-[10px] p-1.5 border border-line whitespace-nowrap text-fg z-10">
                                                    {card.supportEffect.description}
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
