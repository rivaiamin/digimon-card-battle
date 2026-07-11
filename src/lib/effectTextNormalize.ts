/**
 * Normalize catalog effect text → runtime effectId + args (FC-026 / FC-027).
 * Shared by card catalog load and effects.json builder.
 */

import type { EffectArgs } from "../types";

export type AttackType = "circle" | "triangle" | "cross";

export function letterToAttack(letter: string | undefined): AttackType | null {
    if (!letter) return null;
    const l = letter.toLowerCase();
    if (l === "o" || l === "c" || l === "circle") return "circle";
    if (l === "t" || l === "triangle") return "triangle";
    if (l === "x" || l === "cross") return "cross";
    return null;
}

/** Cross / attack descriptions like "1st Attack", "Jamming", "Ice Foe x3". */
export function parseAttackEffectFromDescription(
    description: string
): { effectId: string; effectArgs: EffectArgs } | null {
    const text = description.trim();
    if (!text) return null;

    if (/^1st\s*attack\.?$/i.test(text)) {
        return { effectId: "attack.first_strike", effectArgs: {} };
    }
    if (/^jamming\.?$/i.test(text)) {
        return { effectId: "attack.jamming", effectArgs: {} };
    }

    const foe = text.match(/^(Dark(?:ness)?|Fire|Ice|Nature|Rare)\s+Foe\s+x(\d+)\.?$/i);
    if (foe) {
        const multiplier = parseInt(foe[2] ?? "0", 10);
        if (!Number.isFinite(multiplier) || multiplier <= 1) return null;
        const raw = String(foe[1] ?? "");
        const specialty =
            /^dark/i.test(raw) ? "Dark" : raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
        return {
            effectId: "attack.specialty_mult",
            effectArgs: { specialty, multiplier },
        };
    }

    return null;
}

export type InferredSupportEffect = {
    type: string;
    targetAttack?: string;
    value?: number;
    description: string;
};

/**
 * Promote exact-match catalog_text support lines to mechanical types.
 * Multi-clause / conditional text stays catalog-only.
 */
export function inferSupportEffectFromDescription(
    description: string
): InferredSupportEffect | null {
    const text = description.trim();
    if (!text || /^none\.?$/i.test(text)) return null;

    if (/^opponent'?s support effect is voided\.?$/i.test(text)) {
        return { type: "void_enemy_support", description: text };
    }
    if (/^attack first\.?$/i.test(text)) {
        return { type: "first_strike", description: text };
    }

    const forceAtk = text.match(/^opponent uses (circle|triangle|cross)\.?$/i);
    if (forceAtk) {
        return {
            type: "change_attack",
            targetAttack: letterToAttack(forceAtk[1]) ?? undefined,
            description: text,
        };
    }

    const buffO = text.match(/^boost own circle attack power \+?(\d+)\.?$/i);
    if (buffO) {
        return {
            type: "atk_buff",
            targetAttack: "circle",
            value: Number(buffO[1]),
            description: text,
        };
    }
    const buffT = text.match(/^boost own triangle attack power \+?(\d+)\.?$/i);
    if (buffT) {
        return {
            type: "atk_buff",
            targetAttack: "triangle",
            value: Number(buffT[1]),
            description: text,
        };
    }
    const buffX = text.match(/^boost own cross attack power \+?(\d+)\.?$/i);
    if (buffX) {
        return {
            type: "atk_buff",
            targetAttack: "cross",
            value: Number(buffX[1]),
            description: text,
        };
    }
    const buffAll = text.match(/^boost own attack power \+?(\d+)\.?$/i);
    if (buffAll) {
        return {
            type: "atk_buff",
            targetAttack: "all",
            value: Number(buffAll[1]),
            description: text,
        };
    }

    const heal = text.match(/^recover own hp (?:by )?\+?(\d+)\.?$/i);
    if (heal) {
        return { type: "hp_heal", value: Number(heal[1]), description: text };
    }

    if (/^opponent'?s hp are halved\.?$/i.test(text)) {
        return { type: "halve_hp", description: text };
    }

    return null;
}

/** Map inferred support type → card-level effectId (options / digimon). */
export function supportTypeToEffectId(
    type: string
): { effectId: string; effectArgs: EffectArgs } | null {
    switch (type) {
        case "void_enemy_support":
            return { effectId: "support.void_enemy_support", effectArgs: {} };
        case "first_strike":
            return { effectId: "support.first_strike", effectArgs: {} };
        case "halve_hp":
            return { effectId: "support.halve_hp", effectArgs: {} };
        case "change_attack":
            return { effectId: "support.change_attack", effectArgs: {} };
        case "atk_buff":
            return { effectId: "support.atk_buff", effectArgs: {} };
        case "hp_heal":
            return { effectId: "support.hp_heal", effectArgs: {} };
        case "atk_mult":
            return { effectId: "support.atk_mult", effectArgs: {} };
        default:
            return null;
    }
}
