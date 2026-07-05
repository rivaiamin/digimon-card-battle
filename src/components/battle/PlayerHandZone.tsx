import React from "react";
import { DigimonCard } from "../Card";
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

type PlayerHandZoneProps = {
    hand: DigimonCardData[];
    context: HandInteractionContext;
    onCardAction: (action: HandCardAction) => void;
    onHover: (card: DigimonCardData | null) => void;
    phaseActions?: React.ReactNode;
    supportHint?: string | null;
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
    supportHint,
}) => {
    if (hand.length === 0 && !phaseActions) return null;

    return (
        <div className="fixed bottom-0 inset-x-0 z-[1000] pointer-events-none flex flex-col items-center">
            {(phaseActions || supportHint) && (
                <div className="pointer-events-auto mb-2 flex flex-col items-center gap-2 px-4 max-w-[min(100vw,64rem)] w-full">
                    {supportHint && (
                        <p className="text-xs text-muted text-center">{supportHint}</p>
                    )}
                    {phaseActions}
                </div>
            )}

            <div className="pointer-events-auto w-full border-t border-line bg-panel/95 backdrop-blur-sm px-4 py-3 shadow-[0_-8px_32px_rgba(0,0,0,0.25)]">
                <div className="mx-auto flex max-w-[min(100vw-2rem,64rem)] flex-col gap-2">
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-[10px] font-black uppercase tracking-widest text-muted">
                            Hand ({hand.length})
                        </span>
                    </div>
                    <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
                        {hand.map((card) => {
                            const interaction = getHandCardInteraction(card, context);
                            const dimmed =
                                !interaction.enabled && interaction.mode !== "view";
                            const clickable = interaction.enabled;

                            return (
                                <div
                                    key={card.id}
                                    onClick={() =>
                                        handleCardClick(card, interaction, onCardAction)
                                    }
                                    onMouseEnter={() => onHover(card)}
                                    onMouseLeave={() => onHover(null)}
                                    className={`relative shrink-0 rounded transition-opacity ${
                                        dimmed ? "opacity-45" : "opacity-100"
                                    } ${clickable ? "cursor-pointer" : "cursor-default"} ${
                                        interaction.ringClass
                                    }`}
                                >
                                    <DigimonCard
                                        data={card}
                                        variant="mini"
                                        onHover={undefined}
                                    />
                                    {interaction.badge && (
                                        <div
                                            className={`text-[10px] font-black text-center px-0.5 leading-tight ${
                                                interaction.mode === "deploy"
                                                    ? "bg-ps-green text-black"
                                                    : interaction.mode === "prep_option"
                                                      ? "bg-ps-yellow text-black"
                                                      : interaction.mode === "evolve_option" ||
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
                                    {interaction.mode === "discard" && interaction.enabled && (
                                        <div className="absolute inset-0 bg-ps-red/0 hover:bg-ps-red/75 flex items-center justify-center text-white text-[10px] font-bold text-center p-1 opacity-0 hover:opacity-100 transition-opacity rounded">
                                            DISCARD
                                            <br />
                                            (+{card.plusDp} DP)
                                        </div>
                                    )}
                                    {interaction.mode === "support" && card.supportEffect && (
                                        <div className="absolute inset-x-0 bottom-full mb-1 hidden group-hover:block bg-surface-strong text-[10px] p-1.5 border border-line whitespace-nowrap text-fg z-10">
                                            {card.supportEffect.description}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};
