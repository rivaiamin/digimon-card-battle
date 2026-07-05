import type { PrepSubPhase } from "./openingFlow";

export type OptionPhase = "preparation" | "battle_support";

export interface OptionCardLike {
    cardKind: string;
    effectId: string;
    supportEffect?: { type?: string } | null;
}

export function isPrepOptionCard(card: OptionCardLike): boolean {
    return card.cardKind === "option" && card.effectId.startsWith("option.prep.");
}

export function isBattleOptionCard(card: OptionCardLike): boolean {
    return card.cardKind === "option" && card.effectId.startsWith("option.battle.");
}

export function isEvolutionOptionCard(card: OptionCardLike): boolean {
    return card.cardKind === "evolution_option" && card.effectId.startsWith("evolution_option.");
}

export function canPlayPrepOption(
    card: OptionCardLike,
    prepSubPhase: PrepSubPhase,
    hasActive: boolean
): boolean {
    if (!hasActive || !isPrepOptionCard(card)) return false;
    return prepSubPhase === "discard" || prepSubPhase === "evolve";
}

export function canPlayEvolutionOption(card: OptionCardLike, prepSubPhase: PrepSubPhase, hasActive: boolean): boolean {
    if (!hasActive || !isEvolutionOptionCard(card)) return false;
    return prepSubPhase === "evolve";
}

export function canPlayBattleOption(card: OptionCardLike, phase: string): boolean {
    return phase === "battle_support" && isBattleOptionCard(card);
}

/** Option floppy with battle support text but no normalized effectId yet. */
export function isLegacyBattleOptionCard(card: OptionCardLike): boolean {
    return (
        card.cardKind === "option" &&
        !isPrepOptionCard(card) &&
        !isEvolutionOptionCard(card) &&
        !!card.supportEffect
    );
}

export function canUseAsBattleSupport(card: OptionCardLike): boolean {
    if (card.cardKind === "digimon") {
        return !!card.supportEffect;
    }
    if (card.cardKind === "option") {
        return isBattleOptionCard(card) || isLegacyBattleOptionCard(card);
    }
    return false;
}
