import React from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { DEFAULT_CARD_ATTACKS } from "../../constants";
import type { DigimonCardData } from "../../types";

type Props = {
    card: DigimonCardData | null;
    /** Desktop: hover panel. Mobile: dismissible sheet. */
    mode: "hover" | "sheet";
    onClose?: () => void;
};

/** Shared card inspect panel — hover on desktop, tap/long-press sheet on mobile. */
export function CardPreviewPanel({ card, mode, onClose }: Props) {
    const isSheet = mode === "sheet";

    return (
        <AnimatePresence>
            {card && (
                <>
                    {isSheet && (
                        <motion.button
                            type="button"
                            aria-label="Close card preview"
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[200] bg-black/45 pointer-events-auto sm:hidden"
                            onClick={onClose}
                        />
                    )}
                    <motion.div
                        key={card.id}
                        role={isSheet ? "dialog" : undefined}
                        aria-label={isSheet ? `${card.name} details` : undefined}
                        initial={{ opacity: 0, x: isSheet ? 0 : -20, y: isSheet ? 24 : 0 }}
                        animate={{ opacity: 1, x: 0, y: 0 }}
                        exit={{ opacity: 0, x: isSheet ? 0 : -20, y: isSheet ? 16 : 0 }}
                        className={
                            isSheet
                                ? "fixed inset-x-3 bottom-[calc(var(--battle-hand-clearance)+0.5rem)] z-[210] max-h-[min(70dvh,28rem)] overflow-y-auto rounded-2xl bg-surface-strong border-2 border-ps-blue p-4 shadow-[0_0_50px_rgba(60,155,255,0.3)] pointer-events-auto sm:hidden"
                                : "fixed top-20 left-2 sm:left-10 z-[150] w-[min(100%-1rem,20rem)] sm:w-80 bg-surface-strong border-2 border-ps-blue p-3 sm:p-5 shadow-[0_0_50px_rgba(60,155,255,0.3)] pointer-events-none hidden sm:block"
                        }
                    >
                        <div className="flex justify-between items-start mb-4 border-b border-ps-blue/30 pb-2 gap-2">
                            <div className="min-w-0">
                                <h2 className="text-xl sm:text-2xl font-black italic text-fg uppercase leading-none truncate">
                                    {card.name}
                                </h2>
                                <span className="text-xs font-bold text-ps-blue">
                                    {card.level.toUpperCase()} / {card.type.toUpperCase()}
                                </span>
                            </div>
                            <div className="flex items-start gap-2 shrink-0">
                                <div className="bg-ps-blue/20 p-2 border border-ps-blue/50">
                                    <span className="text-xl font-black text-ps-blue leading-none">
                                        {card.hp}
                                    </span>
                                    <span className="text-xs block text-muted">HP</span>
                                </div>
                                {isSheet && onClose && (
                                    <button
                                        type="button"
                                        onClick={onClose}
                                        className="flex h-9 w-9 items-center justify-center rounded-full bg-panel ring-1 ring-line text-muted"
                                        aria-label="Close"
                                    >
                                        <X className="h-4 w-4" strokeWidth={2} />
                                    </button>
                                )}
                            </div>
                        </div>

                        {card.supportEffect && (
                            <div className="mb-4 sm:mb-6 bg-ps-blue/10 border border-ps-blue/40 p-3">
                                <div className="text-xs font-black text-ps-blue uppercase mb-1 tracking-widest flex items-center gap-2">
                                    <div className="w-1.5 h-1.5 bg-ps-blue animate-pulse" />
                                    Support Effect
                                </div>
                                <p className="text-sm font-bold text-fg leading-relaxed">
                                    {card.supportEffect.description}
                                </p>
                            </div>
                        )}

                        <div className="flex flex-col gap-3">
                            {(() => {
                                const h = card.attacks ?? DEFAULT_CARD_ATTACKS;
                                return (
                                    [
                                        { type: "circle" as const, color: "ps-red", data: h.circle },
                                        { type: "triangle" as const, color: "ps-blue", data: h.triangle },
                                        { type: "cross" as const, color: "ps-yellow", data: h.cross },
                                    ] as const
                                ).map(atk => (
                                    <div
                                        key={atk.type}
                                        className={`border-l-2 border-${atk.color} pl-3 py-1 bg-${atk.color}/5`}
                                    >
                                        <div className="flex justify-between items-center mb-1">
                                            <span
                                                className={`text-xs font-black text-${atk.color} uppercase`}
                                            >
                                                {atk.data.name}
                                            </span>
                                            <span
                                                className={`text-sm font-black text-${atk.color} italic`}
                                            >
                                                {atk.data.damage}
                                            </span>
                                        </div>
                                        <p className="text-xs text-muted leading-tight">
                                            {atk.data.description || "Standard damage attack."}
                                        </p>
                                    </div>
                                ));
                            })()}
                        </div>

                        <div className="mt-4 sm:mt-6 flex justify-between pt-2 border-t border-line text-xs font-bold">
                            <div className="flex flex-col">
                                <span className="text-muted uppercase">Evo Cost</span>
                                <span className="text-ps-blue">{card.evoCost} DP</span>
                            </div>
                            <div className="flex flex-col items-end">
                                <span className="text-muted uppercase">Plus DP</span>
                                <span className="text-ps-yellow">+{card.plusDp}</span>
                            </div>
                        </div>
                    </motion.div>
                </>
            )}
        </AnimatePresence>
    );
}
