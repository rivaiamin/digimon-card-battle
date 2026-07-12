import type { CardKind, EffectArgs } from "../types";
import {
    inferCompoundSupportEffect,
    letterToAttack,
    parseAttackEffectFromDescription,
    supportTypeToEffectId,
} from "./effectTextNormalize";

type LegacySupportEffect = {
    type?: unknown;
    targetAttack?: unknown;
    value?: unknown;
    description?: unknown;
    requireType?: unknown;
    requireOpponentType?: unknown;
    priority?: unknown;
};

export type NormalizedSupportEffect = {
    type: string;
    targetAttack: string;
    value: number;
    description: string;
    requireType: string;
    requireOpponentType: string;
    priority: number;
};

export type NormalizedCardCatalogEntry = {
    id: string;
    name: string;
    cardKind: CardKind;
    effectId: string;
    effectArgs: EffectArgs;
    level: string;
    type: string;
    hp: number;
    maxHp: number;
    plusDp: number;
    evoCost: number;
    image: string;
    attacks: {
        circle: { name: string; damage: number; type: "circle"; description: string; effectId: string; effectArgs: EffectArgs };
        triangle: { name: string; damage: number; type: "triangle"; description: string; effectId: string; effectArgs: EffectArgs };
        cross: { name: string; damage: number; type: "cross"; description: string; effectId: string; effectArgs: EffectArgs };
    };
    supportEffect: NormalizedSupportEffect | null;
};

export const KNOWN_EFFECT_IDS = new Set<string>([
    "support.void_enemy_support",
    "support.first_strike",
    "support.change_attack",
    "support.atk_mult",
    "support.halve_hp",
    "support.atk_buff",
    "support.hp_heal",
    "option.prep.gain_dp",
    "option.prep.draw",
    "option.prep.heal_active",
    "option.prep.fetch_trash_digimon",
    "option.battle.atk_buff",
    "evolution_option.warp_evolve",
    "evolution_option.dp_adjust",
    "evolution_option.restore_full_stats",
    "evolution_option.armor_crush",
    "evolution_option.de_armor",
    "cross.counter",
    "cross.to_zero",
    "cross.crash",
    "cross.eat_up_hp",
    "attack.specialty_mult",
    "attack.first_strike",
    "attack.jamming",
    "support.compose",
    "support.self_halve_hp",
    "support.both_halve_hp",
    "support.both_atk_buff",
    "support.both_atk_zero",
    "support.both_change_attack",
    "support.change_own_specialty",
    "support.hand_x_atk",
    "support.grant_eat_up_hp",
    "support.zero_attacks",
    "support.draw_cards",
]);

function toCardKind(rawKind: unknown): CardKind {
    if (rawKind === "option" || rawKind === "evolution_option" || rawKind === "digimon") {
        return rawKind;
    }
    // Legacy cards are Digimon-only and have no explicit kind.
    return "digimon";
}

function normalizeEffectArgs(rawArgs: unknown): EffectArgs {
    if (!rawArgs || typeof rawArgs !== "object" || Array.isArray(rawArgs)) return {};
    const args: EffectArgs = {};
    for (const [k, v] of Object.entries(rawArgs as Record<string, unknown>)) {
        if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") {
            args[k] = v;
        }
    }
    return args;
}

function parseLegacySupportId(supportId: string, cardId: string): LegacySupportEffect | null {
    if (!supportId || supportId === "none") return null;
    const tokens = supportId.split("_");
    const action = tokens[0];

    if (action === "void" && tokens[1] === "enemy" && tokens[2] === "support") {
        return { type: "void_enemy_support", description: "Nullify enemy Support." };
    }
    if (supportId === "first_strike") {
        return { type: "first_strike", description: "Attack hits first." };
    }
    if (action === "swap" && tokens[1] === "enemy") {
        const to = tokens[4] ?? tokens[3];
        const attack = letterToAttack(to);
        if (attack) return { type: "change_attack", targetAttack: attack };
    }
    if (action === "half" && tokens[1] === "enemy" && tokens[2] === "hp") {
        return { type: "halve_hp" };
    }
    if (action === "buff") {
        const target = tokens[1];
        const value = parseInt(tokens[2] ?? "0", 10) || 0;
        if (target === "all") return { type: "atk_buff", targetAttack: "all", value };
        const atk = letterToAttack(target);
        if (atk) return { type: "atk_buff", targetAttack: atk, value };
    }
    if (action === "heal" && tokens[1] === "hp") {
        const value = parseInt(tokens[2] ?? "0", 10) || 0;
        return { type: "hp_heal", value };
    }

    throw new Error(
        `[cardCatalogLoader] Unsupported legacy support_id "${supportId}" on card "${cardId}".`
    );
}

function normalizeSupportEffect(raw: LegacySupportEffect | null): NormalizedSupportEffect | null {
    if (!raw || typeof raw !== "object") return null;
    let type = String(raw.type ?? "").trim();
    let targetAttack = String(raw.targetAttack ?? "");
    let value = Number(raw.value ?? 0);
    const description = String(raw.description ?? "");
    if (!type) return null;

    if (type === "catalog_text") {
        const inferred = inferCompoundSupportEffect(description);
        if (!inferred) {
            return {
                type: "catalog_text",
                targetAttack: "",
                value: 0,
                description,
                requireType: String(raw.requireType ?? ""),
                requireOpponentType: String(raw.requireOpponentType ?? ""),
                priority: Number(raw.priority ?? 0),
            };
        }
        type = inferred.type;
        targetAttack = inferred.targetAttack ?? "";
        value = inferred.value ?? 0;
    }

    return {
        type,
        targetAttack,
        value,
        description,
        requireType: String(raw.requireType ?? ""),
        requireOpponentType: String(raw.requireOpponentType ?? ""),
        priority: Number(raw.priority ?? 0),
    };
}

function assertKnownEffectId(effectId: string, cardId: string): void {
    if (!KNOWN_EFFECT_IDS.has(effectId)) {
        throw new Error(
            `[cardCatalogLoader] Unknown effectId "${effectId}" on card "${cardId}". Add it to KNOWN_EFFECT_IDS before startup.`
        );
    }
}

function toNormalizedEffectDescriptor(cardId: string, raw: {
    effectId?: unknown;
    effectArgs?: unknown;
    supportEffect?: LegacySupportEffect | null;
    support_id?: unknown;
}): { effectId: string; effectArgs: EffectArgs } {
    if (typeof raw.effectId === "string" && raw.effectId.trim().length > 0) {
        const effectId = raw.effectId.trim();
        assertKnownEffectId(effectId, cardId);
        return { effectId, effectArgs: normalizeEffectArgs(raw.effectArgs) };
    }

    const supportEffect =
        raw.supportEffect ??
        (typeof raw.support_id === "string" ? parseLegacySupportId(raw.support_id, cardId) : null);
    if (!supportEffect) return { effectId: "", effectArgs: {} };

    const targetAttack =
        typeof supportEffect.targetAttack === "string" ? supportEffect.targetAttack : "";
    const value = Number(supportEffect.value ?? 0);
    const type = String(supportEffect.type ?? "");

    switch (type) {
        case "void_enemy_support":
            return { effectId: "support.void_enemy_support", effectArgs: {} };
        case "first_strike":
            return { effectId: "support.first_strike", effectArgs: {} };
        case "change_attack":
            return {
                effectId: "support.change_attack",
                effectArgs: targetAttack ? { targetAttack } : {},
            };
        case "atk_mult":
            return {
                effectId: "support.atk_mult",
                effectArgs: {
                    ...(targetAttack ? { targetAttack } : {}),
                    value: value > 0 ? value : 2,
                },
            };
        case "halve_hp":
            return { effectId: "support.halve_hp", effectArgs: {} };
        case "atk_buff":
            return {
                effectId: "support.atk_buff",
                effectArgs: {
                    ...(targetAttack ? { targetAttack } : {}),
                    value,
                },
            };
        case "hp_heal":
            return { effectId: "support.hp_heal", effectArgs: { value } };
        case "catalog_text": {
            const inferred = inferCompoundSupportEffect(
                String(supportEffect.description ?? "")
            );
            if (!inferred) return { effectId: "", effectArgs: {} };
            const mapped = supportTypeToEffectId(inferred.type);
            if (!mapped) return { effectId: "", effectArgs: {} };
            return {
                effectId: mapped.effectId,
                effectArgs: {
                    ...mapped.effectArgs,
                    ...(inferred.targetAttack ? { targetAttack: inferred.targetAttack } : {}),
                    ...(inferred.value != null ? { value: inferred.value } : {}),
                },
            };
        }
        default: {
            const mapped = supportTypeToEffectId(type);
            if (!mapped) {
                throw new Error(
                    `[cardCatalogLoader] Unsupported legacy supportEffect.type "${type}" on card "${cardId}". Add a normalized mapping first.`
                );
            }
            assertKnownEffectId(mapped.effectId, cardId);
            return {
                effectId: mapped.effectId,
                effectArgs: {
                    ...mapped.effectArgs,
                    ...(targetAttack ? { targetAttack } : {}),
                    ...(value ? { value } : {}),
                },
            };
        }
    }
}

function normalizeAttack<T extends "circle" | "triangle" | "cross">(
    rawAttack: unknown,
    type: T
): {
    name: string;
    damage: number;
    type: T;
    description: string;
    effectId: string;
    effectArgs: EffectArgs;
} {
    const a = rawAttack && typeof rawAttack === "object" ? (rawAttack as Record<string, unknown>) : {};
    let effectId = typeof a.effectId === "string" ? a.effectId.trim() : "";
    let effectArgs = normalizeEffectArgs(a.effectArgs);
    const description = String(a.description ?? "");
    if (!effectId) {
        const parsed = parseAttackEffectFromDescription(description);
        if (parsed) {
            effectId = parsed.effectId;
            effectArgs = { ...parsed.effectArgs, ...effectArgs };
        }
    }
    if (effectId) {
        assertKnownEffectId(effectId, `attack:${type}`);
    }
    return {
        name: String(a.name ?? ""),
        damage: Number(a.damage ?? 0),
        type,
        description,
        effectId,
        effectArgs,
    };
}

function legacyCrossEffect(cardId: string, raw: Record<string, unknown>): { effectId: string; effectArgs: EffectArgs } | null {
    const legacy = typeof raw.x_effect === "string" ? raw.x_effect.trim() : "";
    if (!legacy || legacy === "none") return null;
    if (legacy === "counter_o") {
        return { effectId: "cross.counter", effectArgs: { targetAttack: "circle", multiplier: 2 } };
    }
    if (legacy === "counter_t") {
        return { effectId: "cross.counter", effectArgs: { targetAttack: "triangle", multiplier: 2 } };
    }
    if (legacy === "counter_x") {
        return { effectId: "cross.counter", effectArgs: { targetAttack: "cross", multiplier: 2 } };
    }
    if (legacy === "x_to_zero") {
        return { effectId: "cross.to_zero", effectArgs: { targetAttack: "circle" } };
    }
    if (legacy === "crash") {
        return { effectId: "cross.crash", effectArgs: {} };
    }
    if (legacy === "eat_up_hp" || legacy === "eat-up-hp") {
        return { effectId: "cross.eat_up_hp", effectArgs: {} };
    }
    throw new Error(`[cardCatalogLoader] Unsupported legacy x_effect "${legacy}" on card "${cardId}".`);
}

export function loadCardCatalog(rawCatalog: unknown): NormalizedCardCatalogEntry[] {
    if (!Array.isArray(rawCatalog)) return [];
    const normalized: NormalizedCardCatalogEntry[] = [];

    for (const rawEntry of rawCatalog) {
        if (!rawEntry || typeof rawEntry !== "object") continue;
        const r = rawEntry as Record<string, unknown>;
        if (typeof r.id !== "string" || r.id.length === 0) continue;

        const support = normalizeSupportEffect(
            ((r.supportEffect as LegacySupportEffect | null | undefined) ??
                (typeof r.support_id === "string" ? parseLegacySupportId(r.support_id, String(r.id)) : null)) ??
                null
        );

        const attacks = r.attacks && typeof r.attacks === "object" ? (r.attacks as Record<string, unknown>) : {};
        const crossNorm = normalizeAttack(attacks.cross, "cross");
        const legacyCross = legacyCrossEffect(String(r.id), r);
        if (!crossNorm.effectId && legacyCross) {
            assertKnownEffectId(legacyCross.effectId, String(r.id));
            crossNorm.effectId = legacyCross.effectId;
            crossNorm.effectArgs = legacyCross.effectArgs;
        }

        const effect = toNormalizedEffectDescriptor(String(r.id), {
            effectId: r.effectId,
            effectArgs: r.effectArgs,
            supportEffect: support,
            support_id: r.support_id,
        });

        normalized.push({
            id: String(r.id),
            name: String(r.name ?? ""),
            cardKind: toCardKind(r.cardKind),
            effectId: effect.effectId,
            effectArgs: effect.effectArgs,
            level: String(r.level ?? ""),
            type: String(r.type ?? ""),
            hp: Number(r.hp ?? 0),
            maxHp: Number(r.maxHp ?? r.hp ?? 0),
            plusDp: Number(r.plusDp ?? 0),
            evoCost: Number(r.evoCost ?? 0),
            image: String(r.image ?? ""),
            attacks: {
                circle: normalizeAttack(attacks.circle, "circle"),
                triangle: normalizeAttack(attacks.triangle, "triangle"),
                cross: crossNorm,
            },
            supportEffect: support,
        });
    }

    return normalized;
}

