/**
 * Data-driven prep / evolution / battle option resolution (E3).
 * @see docs/fidelity-rules-contract.md FC-008
 */

import type { EffectArgs } from "../types";
import { readNumberArg } from "./effectArgs";
import { CardSchema, PlayerSchema, SupportEffectSchema } from "../schema/BattleState";
import { inferCompoundSupportEffect } from "./effectTextNormalize";
import { evaluateEvolution, type EvolutionModifiers } from "./evolutionEligibility";
import {
    SUPPORT_PRIORITY,
    applySingleEffect,
    buildEffectRuntime,
    type AttackType,
    type ResolveSupportHooks,
    type SupportBattleContext,
} from "./supportResolver";

export type { EvolutionModifiers };

export interface OptionCardLike {
    id: string;
    cardKind: string;
    effectId: string;
    effectArgs?: EffectArgs;
    level?: string;
    type?: string;
    evoCost?: number;
    maxHp?: number;
    hp?: number;
    circle?: { damage: number };
    triangle?: { damage: number };
    cross?: { damage: number };
    supportEffect?: { type?: string; description?: string; value?: number; targetAttack?: string } | null;
}

export interface CatalogStatSnapshot {
    maxHp: number;
    circle: number;
    triangle: number;
    cross: number;
}

export interface PrepOptionMutableState {
    dp: number;
    hp: number;
    maxHp: number;
    hand: OptionCardLike[];
    deck: OptionCardLike[];
    trash: OptionCardLike[];
}

export type PrepOptionResult =
    | { ok: true; effectId: string; detail?: Record<string, unknown> }
    | { ok: false; reason: string };

const EMPTY_MODIFIERS: EvolutionModifiers = {
    warpSkipLevels: 0,
    dpCostDelta: 0,
    restoreFullStats: false,
    armorCrush: false,
    deArmor: false,
    sameLevel: false,
    ignoreLevel: false,
    ignoreSpecialty: false,
    ignoreDp: false,
};

export function parseEvolutionModifiers(card: OptionCardLike | null | undefined): EvolutionModifiers {
    if (!card || card.cardKind !== "evolution_option") return { ...EMPTY_MODIFIERS };

    const args = card.effectArgs ?? {};
    switch (card.effectId) {
        case "evolution_option.warp_evolve":
            return {
                ...EMPTY_MODIFIERS,
                warpSkipLevels: Math.max(0, readNumberArg(args, "skipLevels", 1)),
                dpCostDelta: readNumberArg(args, "dpCostDelta", 0),
            };
        case "evolution_option.dp_adjust":
            return {
                ...EMPTY_MODIFIERS,
                warpSkipLevels: Math.max(0, readNumberArg(args, "skipLevels", 0)),
                dpCostDelta: readNumberArg(args, "delta", 0),
            };
        case "evolution_option.restore_full_stats":
            return {
                ...EMPTY_MODIFIERS,
                dpCostDelta: readNumberArg(args, "dpCostDelta", 0),
                restoreFullStats: true,
            };
        case "evolution_option.armor_crush":
            return {
                ...EMPTY_MODIFIERS,
                armorCrush: true,
            };
        case "evolution_option.de_armor":
            return {
                ...EMPTY_MODIFIERS,
                deArmor: true,
            };
        case "evolution_option.mutant":
            return {
                ...EMPTY_MODIFIERS,
                sameLevel: true,
                ignoreSpecialty: true,
            };
        case "evolution_option.download":
            return {
                ...EMPTY_MODIFIERS,
                ignoreLevel: true,
                ignoreSpecialty: true,
                ignoreDp: true,
            };
        default:
            return { ...EMPTY_MODIFIERS };
    }
}

export function mergeEvolutionModifiers(a: EvolutionModifiers, b: EvolutionModifiers): EvolutionModifiers {
    return {
        warpSkipLevels: Math.max(a.warpSkipLevels, b.warpSkipLevels),
        dpCostDelta: a.dpCostDelta + b.dpCostDelta,
        restoreFullStats: a.restoreFullStats || b.restoreFullStats,
        armorCrush: a.armorCrush || b.armorCrush,
        deArmor: a.deArmor || b.deArmor,
        sameLevel: a.sameLevel || b.sameLevel,
        ignoreLevel: a.ignoreLevel || b.ignoreLevel,
        ignoreSpecialty: a.ignoreSpecialty || b.ignoreSpecialty,
        ignoreDp: a.ignoreDp || b.ignoreDp,
    };
}

export function canEvolveWithOption(
    active: { level: string; type: string } | null | undefined,
    target: { level: string; type: string; evoCost: number; cardKind?: string },
    playerDp: number,
    modifiers: EvolutionModifiers
): boolean {
    return evaluateEvolution(active, target, playerDp, {
        dpCostDelta: modifiers.dpCostDelta,
        warpSkipLevels: modifiers.warpSkipLevels,
        armorCrush: modifiers.armorCrush,
        deArmor: modifiers.deArmor,
        sameLevel: modifiers.sameLevel,
        ignoreLevel: modifiers.ignoreLevel,
        ignoreSpecialty: modifiers.ignoreSpecialty,
        ignoreDp: modifiers.ignoreDp,
    }).ok;
}

export function resolvePrepOption(
    card: OptionCardLike,
    state: PrepOptionMutableState,
    drawFromDeck: (count: number) => number
): PrepOptionResult {
    const args = card.effectArgs ?? {};

    switch (card.effectId) {
        case "option.prep.gain_dp": {
            const value = readNumberArg(args, "value", 0);
            if (value <= 0) return { ok: false, reason: "invalid_gain_dp_value" };
            state.dp += value;
            return { ok: true, effectId: card.effectId, detail: { gained: value, dp: state.dp } };
        }
        case "option.prep.draw": {
            const count = Math.max(1, readNumberArg(args, "count", 1));
            const drawn = drawFromDeck(count);
            return { ok: true, effectId: card.effectId, detail: { requested: count, drawn } };
        }
        case "option.prep.heal_active": {
            const value = readNumberArg(args, "value", 0);
            if (value <= 0) return { ok: false, reason: "invalid_heal_value" };
            if (state.maxHp <= 0) return { ok: false, reason: "no_active_digimon" };
            const before = state.hp;
            state.hp = Math.min(state.maxHp, state.hp + value);
            return { ok: true, effectId: card.effectId, detail: { before, after: state.hp } };
        }
        case "option.prep.fetch_trash_digimon": {
            const trashIdx = state.trash.findIndex(c => c.cardKind === "digimon" || !c.cardKind);
            if (trashIdx === -1) return { ok: false, reason: "no_digimon_in_trash" };
            const [fetched] = state.trash.splice(trashIdx, 1);
            state.hand.push(fetched);
            return { ok: true, effectId: card.effectId, detail: { fetchedId: fetched.id } };
        }
        default:
            return { ok: false, reason: "unsupported_prep_option" };
    }
}

export function applyFullStatsFromCatalog(card: OptionCardLike, catalog: CatalogStatSnapshot): void {
    card.maxHp = catalog.maxHp;
    card.hp = catalog.maxHp;
    if (card.circle) card.circle.damage = catalog.circle;
    if (card.triangle) card.triangle.damage = catalog.triangle;
    if (card.cross) card.cross.damage = catalog.cross;
}

export function shouldRestoreFullStatsAfterEvolve(
    modifiers: EvolutionModifiers,
    openingPenaltyActive: boolean,
    fromLevel: string,
    toLevel: string
): boolean {
    if (modifiers.restoreFullStats) return true;
    // PS1 manual: penalized Level C -> Level U with any Digivolve Option restores full power.
    if (!openingPenaltyActive) return false;
    const from = fromLevel.trim().toLowerCase();
    const to = toLevel.trim().toLowerCase();
    return from === "champion" && to === "ultimate";
}

/**
 * The battle context an option effect writes into.
 *
 * Structurally `SupportBattleContext` with only the bonus map required: legacy
 * callers (and the option unit tests) pass a bare `{ attackBonus }`, and the
 * missing carriers are created in place on first use. A card whose outcome needs
 * a carrier the caller never reads is still reported rather than silently
 * dropped — see {@link applyBattleOptionToContext}.
 */
export type AttackBonusContext = Partial<SupportBattleContext> & {
    attackBonus: SupportBattleContext["attackBonus"];
};

/** Mutable HP snapshot for battle-option heals (caller writes back to player schema). */
export interface BattleOptionHpTarget {
    hp: number;
    maxHp: number;
}

/**
 * The real battle state a card needs beyond the bonus maps.
 *
 * Without it the option path has no players to mutate, so a card that discards,
 * draws, changes a specialty or revives cannot apply. The server always supplies
 * this; the bonus-map-only form is kept for the legacy callers and the unit tests.
 */
export interface BattleOptionBattleState {
    /** The player playing the option (the effect's source). */
    source: PlayerSchema;
    /** The opponent (the effect's target). */
    target: PlayerSchema;
    /** Locked attacks, when the profile locks attacks before support resolves. */
    sourceAttack?: AttackType | null;
    targetAttack?: AttackType | null;
    /** Draw / seeded-RNG hooks the shared dispatcher needs. */
    hooks?: ResolveSupportHooks;
    /**
     * Called when the card cannot be resolved. The caller records this, so an
     * unsupported effect is never a silent no-op.
     */
    onUnresolved?: (reason: string, detail: Record<string, unknown>) => void;
}

/** Fill in the carriers a partial context lacks, so the dispatcher can run. */
function normalizeContext(ctx: AttackBonusContext): SupportBattleContext {
    ctx.attackMultiplier ??= new Map();
    ctx.attackOverride ??= new Map();
    ctx.firstStrikePlayers ??= new Set();
    ctx.attackSecondPlayers ??= new Set();
    ctx.forcedAttack ??= new Map();
    ctx.eatUpHpPlayers ??= new Set();
    ctx.counterGrants ??= new Map();
    ctx.reviveHp ??= new Map();
    // Every optional carrier now holds a value; the compiler cannot see that.
    return ctx as SupportBattleContext;
}

/** The normalized effect a card carries, or null when it carries none. */
function toSupportEffect(card: OptionCardLike): SupportEffectSchema | null {
    const args = card.effectArgs ?? {};
    const se = card.supportEffect;
    let type = String(se?.type ?? "").trim();
    let description = String(se?.description ?? "");

    // `catalog_text` is the loader's marker for "text not yet inferred"; a card
    // built by hand (tests, fixtures) still carries it, so infer here too.
    if (type === "catalog_text") {
        const inferred = inferCompoundSupportEffect(description);
        if (!inferred) return null;
        type = inferred.type;
        description = inferred.description ?? description;
    }
    if (!type) {
        const idType = String(card.effectId ?? "").trim().split(".").pop() ?? "";
        if (!idType) return null;
        type = idType;
    }

    const effect = new SupportEffectSchema();
    effect.type = type;
    effect.value = se?.value || readNumberArg(args, "value", 0);
    effect.targetAttack =
        String(se?.targetAttack ?? "").trim() ||
        (typeof args.targetAttack === "string" ? args.targetAttack : "");
    effect.description = description;
    return effect;
}

/** Why an option card's effect could not be applied. */
export type OptionEffectRejection =
    | "unknown_card_kind"
    | "no_effect_text"
    | "unsupported_effect_text"
    | "unsupported_effect_id";

export type OptionEffectVerdict =
    | { implemented: true; effectType: string }
    | { implemented: false; reason: OptionEffectRejection; detail: Record<string, unknown> };

/** Prep effect ids `resolvePrepOption` implements. */
const PREP_EFFECT_IDS: Record<string, true> = {
    "option.prep.gain_dp": true,
    "option.prep.draw": true,
    "option.prep.heal_active": true,
    "option.prep.fetch_trash_digimon": true,
};

/** Evolution effect ids `parseEvolutionModifiers` implements. */
const EVOLUTION_EFFECT_IDS: Record<string, true> = {
    "evolution_option.warp_evolve": true,
    "evolution_option.dp_adjust": true,
    "evolution_option.restore_full_stats": true,
    "evolution_option.armor_crush": true,
    "evolution_option.de_armor": true,
    "evolution_option.mutant": true,
    "evolution_option.download": true,
};

/**
 * Decide whether an option card's effect reaches a runtime at all.
 *
 * The single verdict every option path consults, so a card cannot be
 * "implemented" in one place and a silent no-op in another. A card that fails
 * this test MUST be reported by its caller — the whole point is that the answer
 * is never simply "nothing happened".
 */
export function classifyOptionEffect(card: OptionCardLike): OptionEffectVerdict {
    const effectId = String(card.effectId ?? "").trim();
    const cardKind = String(card.cardKind ?? "").trim();

    if (cardKind === "evolution_option") {
        if (EVOLUTION_EFFECT_IDS[effectId]) return { implemented: true, effectType: effectId };
        return {
            implemented: false,
            reason: "unsupported_effect_id",
            detail: {
                cardId: card.id,
                effectId,
                description: String(card.supportEffect?.description ?? ""),
            },
        };
    }

    if (cardKind !== "option") {
        return {
            implemented: false,
            reason: "unknown_card_kind",
            detail: { cardId: card.id, cardKind },
        };
    }

    if (PREP_EFFECT_IDS[effectId]) return { implemented: true, effectType: effectId };

    const effect = toSupportEffect(card);
    if (!effect) {
        return {
            implemented: false,
            reason: "no_effect_text",
            detail: {
                cardId: card.id,
                effectId,
                description: String(card.supportEffect?.description ?? ""),
            },
        };
    }
    if (!isResolvableType(effect.type)) {
        return {
            implemented: false,
            reason: "unsupported_effect_text",
            detail: { cardId: card.id, effectType: effect.type, description: effect.description },
        };
    }
    return { implemented: true, effectType: effect.type };
}

/**
 * True when the shared dispatcher can resolve this type. `SUPPORT_PRIORITY` is
 * the dispatcher's own vocabulary (it covers the primitives plus compose and
 * conditional), so membership here is what keeps a card off `default: break`.
 */
function isResolvableType(type: string): boolean {
    return type in SUPPORT_PRIORITY;
}

/** Observable battle state, used to tell an applied effect from a no-op. */
function battleStateFingerprint(
    ctx: SupportBattleContext,
    players: readonly PlayerSchema[]
): string {
    return JSON.stringify({
        bonus: [...ctx.attackBonus],
        mult: [...ctx.attackMultiplier],
        override: [...ctx.attackOverride],
        forced: [...ctx.forcedAttack],
        counter: [...ctx.counterGrants],
        revive: [...ctx.reviveHp],
        firstStrike: [...ctx.firstStrikePlayers],
        attackSecond: [...ctx.attackSecondPlayers],
        eatUpHp: [...ctx.eatUpHpPlayers],
        players: players.map(p => [
            p.hp,
            p.dp,
            p.hand.length,
            p.deck.length,
            p.trash.length,
            p.dpSlot.length,
            p.active?.type ?? "",
            p.active?.hp ?? -1,
            p.supportCard ? 1 : 0,
        ]),
    });
}

/**
 * Player pair for callers that supply no real battle state (the option unit
 * tests, and any legacy bonus-map caller). The HP shim is carried on the source
 * so an HP heal still lands somewhere the caller can read back.
 */
function shimPlayers(
    sourceSessionId: string,
    hpTarget?: BattleOptionHpTarget
): { source: PlayerSchema; target: PlayerSchema } {
    const source = new PlayerSchema();
    source.sessionId = sourceSessionId;
    source.hp = hpTarget?.hp ?? 0;
    const active = new CardSchema();
    active.id = `${sourceSessionId}-active`;
    active.cardKind = "digimon";
    active.maxHp = hpTarget?.maxHp ?? 0;
    active.hp = source.hp;
    source.active = active;

    const target = new PlayerSchema();
    target.sessionId = `${sourceSessionId}-opponent`;
    return { source, target };
}

/**
 * Apply a surviving battle option (after void checks).
 *
 * Routes the card's effect through the single primitive dispatcher in
 * `supportResolver` — the same one Digimon support uses — so the option path and
 * the support path cannot disagree about which primitive applies.
 *
 * Pass `battle` for the real runtime: it supplies the players an effect mutates
 * and the locked attacks a conditional gate needs. Without it the call still
 * runs, against a throwaway player pair, which is enough for effects whose whole
 * outcome lives in the bonus maps.
 *
 * An effect the dispatcher cannot apply is reported through `battle.onUnresolved`
 * rather than silently doing nothing.
 *
 * @returns true when observable battle state changed.
 */
export function applyBattleOptionToContext(
    card: OptionCardLike,
    sourceSessionId: string,
    ctx: AttackBonusContext,
    hpTarget?: BattleOptionHpTarget,
    battle?: BattleOptionBattleState
): boolean {
    const full = normalizeContext(ctx);
    const players = battle ?? shimPlayers(sourceSessionId, hpTarget);
    const unresolved = battle?.onUnresolved;

    const effect = toSupportEffect(card);
    if (!effect) {
        unresolved?.("no_effect_text", {
            cardId: card.id,
            effectId: card.effectId,
            description: String(card.supportEffect?.description ?? ""),
        });
        return false;
    }
    if (!isResolvableType(effect.type)) {
        unresolved?.("unsupported_effect_text", {
            cardId: card.id,
            effectType: effect.type,
            description: effect.description,
        });
        return false;
    }

    const pair = [players.source, players.target];
    const before = battleStateFingerprint(full, pair);
    const runtime = battle
        ? buildEffectRuntime(
              players.source,
              players.target,
              battle.sourceAttack ?? null,
              battle.targetAttack ?? null
          )
        : undefined;
    applySingleEffect(players.source, players.target, effect, full, battle?.hooks, runtime);
    if (hpTarget) hpTarget.hp = players.source.hp;
    return battleStateFingerprint(full, pair) !== before;
}
