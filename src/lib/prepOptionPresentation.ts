/**
 * Prep option UI labels and client feedback (FC-008 / P2-4).
 */

import { readNumberArg } from "./effectArgs";
import type { EffectArgs } from "../types";

export type PrepOptionCardView = {
    effectId: string;
    effectArgs?: EffectArgs;
    name?: string;
};

export function getPrepOptionBadge(card: PrepOptionCardView): string {
    const args = card.effectArgs ?? {};
    switch (card.effectId) {
        case "option.prep.gain_dp": {
            const value = readNumberArg(args, "value", 0);
            return value > 0 ? `+${value} DP` : "GAIN DP";
        }
        case "option.prep.draw": {
            const count = Math.max(1, readNumberArg(args, "count", 1));
            return count === 1 ? "DRAW 1" : `DRAW ${count}`;
        }
        case "option.prep.heal_active": {
            const value = readNumberArg(args, "value", 0);
            return value > 0 ? `HEAL ${value}` : "HEAL";
        }
        case "option.prep.fetch_trash_digimon":
            return "FETCH";
        default:
            return "PLAY";
    }
}

export type PrepOptionFeedbackDeltas = {
    dpGain?: number;
    hpGain?: number;
    cardsDrawn?: number;
};

export function formatPrepOptionFeedback(
    card: PrepOptionCardView,
    deltas: PrepOptionFeedbackDeltas
): string {
    const args = card.effectArgs ?? {};
    switch (card.effectId) {
        case "option.prep.gain_dp": {
            const gain = deltas.dpGain ?? readNumberArg(args, "value", 0);
            return gain > 0 ? `+${gain} DP` : "DP gained";
        }
        case "option.prep.draw": {
            const drawn = deltas.cardsDrawn ?? readNumberArg(args, "count", 1);
            return drawn === 1 ? "Drew 1 card" : `Drew ${drawn} cards`;
        }
        case "option.prep.heal_active": {
            const heal = deltas.hpGain ?? readNumberArg(args, "value", 0);
            return heal > 0 ? `+${heal} HP` : "HP recovered";
        }
        case "option.prep.fetch_trash_digimon":
            return "Digimon fetched";
        default:
            return card.name ? `${card.name} played` : "Option played";
    }
}
