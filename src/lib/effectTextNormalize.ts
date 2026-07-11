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

export function normalizeSpecialtyLabel(raw: string): string {
    const t = raw.trim().toLowerCase();
    if (t === "darkness" || t === "dark") return "Dark";
    if (t === "fire") return "Fire";
    if (t === "ice") return "Ice";
    if (t === "nature") return "Nature";
    if (t === "rare") return "Rare";
    return raw.trim();
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
        const specialty = normalizeSpecialtyLabel(String(foe[1] ?? ""));
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

/** Split multi-clause support text without breaking quoted fragments. */
export function splitEffectClauses(text: string): string[] {
    const clauses: string[] = [];
    let buf = "";
    let inQuote = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]!;
        if (ch === '"' || ch === "“" || ch === "”") {
            // Closing quote after an interior period ends the clause
            // (e.g. Own attack becomes "Eat-up HP.")
            if (inQuote && buf.trimEnd().endsWith(".")) {
                const trimmed = buf.trim().replace(/\.$/, "");
                if (trimmed) clauses.push(trimmed);
                buf = "";
                inQuote = false;
                continue;
            }
            inQuote = !inQuote;
            buf += ch;
            continue;
        }
        if (ch === "." && !inQuote) {
            const trimmed = buf.trim();
            if (trimmed) clauses.push(trimmed);
            buf = "";
            continue;
        }
        buf += ch;
    }
    const tail = buf.trim().replace(/\.$/, "");
    if (tail) clauses.push(tail);
    return clauses;
}

/**
 * Promote exact-match catalog_text support lines to mechanical types.
 * Also used as a single-clause parser inside compound effects.
 */
export function inferSupportEffectFromDescription(
    description: string
): InferredSupportEffect | null {
    const text = description
        .trim()
        .replace(/\.$/, "")
        .replace(/["“”]/g, "")
        .trim();
    if (!text || /^none$/i.test(text)) return null;

    if (/^opponent'?s support effect is voided$/i.test(text)) {
        return { type: "void_enemy_support", description: text };
    }
    if (/^attack first$/i.test(text)) {
        return { type: "first_strike", description: text };
    }

    const forceAtk = text.match(/^opponent uses (circle|triangle|cross)$/i);
    if (forceAtk) {
        return {
            type: "change_attack",
            targetAttack: letterToAttack(forceAtk[1]) ?? undefined,
            description: text,
        };
    }

    const bothForce = text.match(/^both players(?:' attacks)?(?: become| use) (circle|triangle|cross)$/i);
    if (bothForce) {
        return {
            type: "both_change_attack",
            targetAttack: letterToAttack(bothForce[1]) ?? undefined,
            description: text,
        };
    }

    const buffO = text.match(/^boost own circle attack power (?:by )?\+?(\d+)$/i);
    if (buffO) {
        return {
            type: "atk_buff",
            targetAttack: "circle",
            value: Number(buffO[1]),
            description: text,
        };
    }
    const buffT = text.match(/^boost own triangle attack power (?:by )?\+?(\d+)$/i);
    if (buffT) {
        return {
            type: "atk_buff",
            targetAttack: "triangle",
            value: Number(buffT[1]),
            description: text,
        };
    }
    const buffX = text.match(/^boost own cross attack power (?:by )?\+?(\d+)$/i);
    if (buffX) {
        return {
            type: "atk_buff",
            targetAttack: "cross",
            value: Number(buffX[1]),
            description: text,
        };
    }
    const buffAll = text.match(/^boost own attack power (?:by )?\+?(\d+)$/i);
    if (buffAll) {
        return {
            type: "atk_buff",
            targetAttack: "all",
            value: Number(buffAll[1]),
            description: text,
        };
    }
    const buffBare = text.match(/^boost attack power (?:by )?\+?(\d+)$/i);
    if (buffBare) {
        return {
            type: "atk_buff",
            targetAttack: "all",
            value: Number(buffBare[1]),
            description: text,
        };
    }

    const bothBuff = text.match(/^both players boost attack power \+?(\d+)$/i);
    if (bothBuff) {
        return {
            type: "both_atk_buff",
            targetAttack: "all",
            value: Number(bothBuff[1]),
            description: text,
        };
    }

    const heal = text.match(/^recover own hp (?:by )?\+?(\d+)$/i);
    if (heal) {
        return { type: "hp_heal", value: Number(heal[1]), description: text };
    }

    if (/^opponent'?s hp are halved$/i.test(text)) {
        return { type: "halve_hp", description: text };
    }
    if (/^own hp are halved$/i.test(text)) {
        return { type: "self_halve_hp", description: text };
    }
    if (/^both players'? hp are halved$/i.test(text)) {
        return { type: "both_halve_hp", description: text };
    }
    if (/^both players'? attack power becomes 0$/i.test(text)) {
        return { type: "both_atk_zero", description: text };
    }

    const ownSpecialty = text.match(/^changes? own specialty to (fire|ice|nature|darkness|dark|rare)$/i);
    if (ownSpecialty) {
        return {
            type: "change_own_specialty",
            targetAttack: normalizeSpecialtyLabel(ownSpecialty[1] ?? ""),
            description: text,
        };
    }

    const handAtk = text.match(/^add number of cards in hand x(\d+) to own attack power$/i);
    if (handAtk) {
        return {
            type: "hand_x_atk",
            targetAttack: "all",
            value: Number(handAtk[1]),
            description: text,
        };
    }

    if (/^own attack becomes\s*eat-up hp$/i.test(text)) {
        return { type: "grant_eat_up_hp", description: text };
    }

    if (/^circle & triangle attack power are 0$/i.test(text)) {
        return { type: "zero_attacks", targetAttack: "circle,triangle", description: text };
    }

    const draw = text.match(/^draw (\d+) cards?(?: from(?: own)? online deck)?$/i);
    if (draw) {
        return { type: "draw_cards", value: Number(draw[1]), description: text };
    }

    return null;
}

/**
 * If every clause maps to a known support primitive, return a compose effect
 * (or the single primitive when there is only one clause).
 */
export function inferCompoundSupportEffect(
    description: string
): InferredSupportEffect | null {
    const text = description.trim();
    if (!text || /^none\.?$/i.test(text)) return null;

    const single = inferSupportEffectFromDescription(text);
    if (single) return single;

    const clauses = splitEffectClauses(text);
    if (clauses.length < 2) return null;

    const steps = clauses.map(c => inferSupportEffectFromDescription(c));
    if (steps.some(s => s == null)) return null;

    return {
        type: "compose",
        description: text,
    };
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
        case "self_halve_hp":
            return { effectId: "support.self_halve_hp", effectArgs: {} };
        case "both_halve_hp":
            return { effectId: "support.both_halve_hp", effectArgs: {} };
        case "change_attack":
            return { effectId: "support.change_attack", effectArgs: {} };
        case "both_change_attack":
            return { effectId: "support.both_change_attack", effectArgs: {} };
        case "atk_buff":
            return { effectId: "support.atk_buff", effectArgs: {} };
        case "both_atk_buff":
            return { effectId: "support.both_atk_buff", effectArgs: {} };
        case "both_atk_zero":
            return { effectId: "support.both_atk_zero", effectArgs: {} };
        case "hp_heal":
            return { effectId: "support.hp_heal", effectArgs: {} };
        case "atk_mult":
            return { effectId: "support.atk_mult", effectArgs: {} };
        case "change_own_specialty":
            return { effectId: "support.change_own_specialty", effectArgs: {} };
        case "hand_x_atk":
            return { effectId: "support.hand_x_atk", effectArgs: {} };
        case "grant_eat_up_hp":
            return { effectId: "support.grant_eat_up_hp", effectArgs: {} };
        case "zero_attacks":
            return { effectId: "support.zero_attacks", effectArgs: {} };
        case "draw_cards":
            return { effectId: "support.draw_cards", effectArgs: {} };
        case "compose":
            return { effectId: "support.compose", effectArgs: {} };
        default:
            return null;
    }
}
