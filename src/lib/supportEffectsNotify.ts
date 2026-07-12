/**
 * Structured support-effect notifications for the battle_effects beat.
 */

import type { SupportBattleContext } from "./supportResolver";
import type { SupportNullificationResult } from "./supportResolver";

export type SupportEffectKind =
    | "hp_heal"
    | "atk_buff"
    | "void"
    | "first_strike"
    | "grant_eat_up"
    | "atk_mult"
    | "other";

export interface SupportEffectNotification {
    kind: SupportEffectKind;
    sessionId: string;
    value?: number;
    attackTarget?: string;
    label: string;
}

export type SupportEffectsPayload = {
    effects: SupportEffectNotification[];
};

function cloneBonuses(
    map: Map<string, { circle: number; triangle: number; cross: number }>
): Map<string, { circle: number; triangle: number; cross: number }> {
    const out = new Map<string, { circle: number; triangle: number; cross: number }>();
    for (const [k, v] of map) {
        out.set(k, { ...v });
    }
    return out;
}

function cloneMults(
    map: Map<string, { circle: number; triangle: number; cross: number }>
): Map<string, { circle: number; triangle: number; cross: number }> {
    return cloneBonuses(map);
}

export function snapshotSupportCtx(ctx: SupportBattleContext): {
    attackBonus: Map<string, { circle: number; triangle: number; cross: number }>;
    attackMultiplier: Map<string, { circle: number; triangle: number; cross: number }>;
    firstStrikePlayers: Set<string>;
    eatUpHpPlayers: Set<string>;
} {
    return {
        attackBonus: cloneBonuses(ctx.attackBonus),
        attackMultiplier: cloneMults(ctx.attackMultiplier),
        firstStrikePlayers: new Set(ctx.firstStrikePlayers),
        eatUpHpPlayers: new Set(ctx.eatUpHpPlayers),
    };
}

function bonusDeltaLabel(
    before: { circle: number; triangle: number; cross: number } | undefined,
    after: { circle: number; triangle: number; cross: number } | undefined
): { value: number; attackTarget: string; label: string } | null {
    const b = before ?? { circle: 0, triangle: 0, cross: 0 };
    const a = after ?? { circle: 0, triangle: 0, cross: 0 };
    const dc = a.circle - b.circle;
    const dt = a.triangle - b.triangle;
    const dx = a.cross - b.cross;
    if (dc === 0 && dt === 0 && dx === 0) return null;
    if (dc === dt && dt === dx && dc !== 0) {
        const sign = dc > 0 ? "+" : "";
        return { value: dc, attackTarget: "all", label: `${sign}${dc} ATK` };
    }
    if (dc !== 0 && dt === 0 && dx === 0) {
        const sign = dc > 0 ? "+" : "";
        return { value: dc, attackTarget: "circle", label: `${sign}${dc} CIRCLE` };
    }
    if (dt !== 0 && dc === 0 && dx === 0) {
        const sign = dt > 0 ? "+" : "";
        return { value: dt, attackTarget: "triangle", label: `${sign}${dt} TRIANGLE` };
    }
    if (dx !== 0 && dc === 0 && dt === 0) {
        const sign = dx > 0 ? "+" : "";
        return { value: dx, attackTarget: "cross", label: `${sign}${dx} CROSS` };
    }
    const parts: string[] = [];
    if (dc) parts.push(`${dc > 0 ? "+" : ""}${dc}○`);
    if (dt) parts.push(`${dt > 0 ? "+" : ""}${dt}△`);
    if (dx) parts.push(`${dx > 0 ? "+" : ""}${dx}✕`);
    return { value: dc || dt || dx, attackTarget: "mixed", label: parts.join(" ") };
}

export function buildSupportEffectNotifications(input: {
    activeSessionId: string;
    defenderSessionId: string;
    hpBefore: Record<string, number>;
    hpAfter: Record<string, number>;
    before: ReturnType<typeof snapshotSupportCtx>;
    after: SupportBattleContext;
    nullify: SupportNullificationResult;
}): SupportEffectNotification[] {
    const effects: SupportEffectNotification[] = [];
    const sessionIds = [input.activeSessionId, input.defenderSessionId];

    if (input.nullify.activeVoided) {
        effects.push({
            kind: "void",
            sessionId: input.activeSessionId,
            label: "SUPPORT VOIDED",
        });
    }
    if (input.nullify.defenderVoided) {
        effects.push({
            kind: "void",
            sessionId: input.defenderSessionId,
            label: "SUPPORT VOIDED",
        });
    }

    for (const sessionId of sessionIds) {
        const heal = (input.hpAfter[sessionId] ?? 0) - (input.hpBefore[sessionId] ?? 0);
        if (heal > 0) {
            effects.push({
                kind: "hp_heal",
                sessionId,
                value: heal,
                label: `+${heal} HP`,
            });
        }

        const buff = bonusDeltaLabel(
            input.before.attackBonus.get(sessionId),
            input.after.attackBonus.get(sessionId)
        );
        if (buff) {
            effects.push({
                kind: "atk_buff",
                sessionId,
                value: buff.value,
                attackTarget: buff.attackTarget,
                label: buff.label,
            });
        }

        const mb = input.before.attackMultiplier.get(sessionId) ?? {
            circle: 1,
            triangle: 1,
            cross: 1,
        };
        const ma = input.after.attackMultiplier.get(sessionId) ?? {
            circle: 1,
            triangle: 1,
            cross: 1,
        };
        if (ma.circle !== mb.circle || ma.triangle !== mb.triangle || ma.cross !== mb.cross) {
            const factor =
                ma.circle !== mb.circle
                    ? ma.circle / (mb.circle || 1)
                    : ma.triangle !== mb.triangle
                      ? ma.triangle / (mb.triangle || 1)
                      : ma.cross / (mb.cross || 1);
            effects.push({
                kind: "atk_mult",
                sessionId,
                value: factor,
                label: `×${factor} ATK`,
            });
        }

        if (
            input.after.firstStrikePlayers.has(sessionId) &&
            !input.before.firstStrikePlayers.has(sessionId)
        ) {
            effects.push({
                kind: "first_strike",
                sessionId,
                label: "FIRST STRIKE",
            });
        }

        if (
            input.after.eatUpHpPlayers.has(sessionId) &&
            !input.before.eatUpHpPlayers.has(sessionId)
        ) {
            effects.push({
                kind: "grant_eat_up",
                sessionId,
                label: "EAT-UP HP",
            });
        }
    }

    return effects;
}

export function serializeSupportEffects(effects: SupportEffectNotification[]): string {
    return JSON.stringify({ effects } satisfies SupportEffectsPayload);
}

export function parseSupportEffectsJson(raw: string | null | undefined): SupportEffectNotification[] {
    if (!raw || !raw.trim()) return [];
    try {
        const parsed = JSON.parse(raw) as SupportEffectsPayload;
        if (!parsed || !Array.isArray(parsed.effects)) return [];
        return parsed.effects.filter(
            (e) => e && typeof e.sessionId === "string" && typeof e.kind === "string"
        );
    } catch {
        return [];
    }
}

export function hasSupportEffectNotifications(effects: SupportEffectNotification[]): boolean {
    return effects.length > 0;
}
