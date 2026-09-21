/**
 * Option resolution integrity (FC-008) — regression coverage for leaf-1.1.2.
 *
 * Each case here fails on the pre-fix tree. The defects:
 *   1. `applyBattleOptionToContext` kept a SECOND dispatch table (5 primitives)
 *      instead of routing through `supportResolver.applySingleEffect`, so every
 *      card whose effect was outside that table was a silent no-op.
 *   2. Its conditional branch had no `EffectRuntime`, and `applySingleEffect`
 *      returns early for `conditional` without one, so conditional cards no-op'd.
 *   3. An effect outside the dispatcher's vocabulary hit `default: break` with
 *      no signal at all.
 *   4. `evolution_option.download` sets `ignoreDp`, so `BattleRoom.evolve`
 *      deducted at 0 DP and drove the gauge to -200.
 *   5. `EvolutionCostModifiers` and `EvolutionModifiers` were two declarations
 *      extended in lockstep.
 */

import { describe, expect, it } from "vitest";

import cardsData from "../data/cards.json";
import { loadCardCatalog, type NormalizedCardCatalogEntry } from "./cardCatalogLoader";
import {
    applyBattleOptionToContext,
    classifyOptionEffect,
    type OptionCardLike,
} from "./optionResolver";
import {
    evaluateEvolution,
    spendEvolutionDp,
    type EvolutionCostModifiers,
} from "./evolutionEligibility";
import { parseEvolutionModifiers, type EvolutionModifiers } from "./optionResolver";
import { createSupportBattleContext } from "./supportResolver";
import { CardSchema, PlayerSchema } from "../schema/BattleState";

function optionLike(card: NormalizedCardCatalogEntry): OptionCardLike {
    const se = card.supportEffect;
    return {
        id: card.id,
        cardKind: card.cardKind,
        effectId: card.effectId,
        effectArgs: card.effectArgs,
        supportEffect: se
            ? {
                  type: se.type,
                  description: se.description,
                  value: se.value,
                  targetAttack: se.targetAttack,
              }
            : null,
    };
}

const CATALOG = loadCardCatalog(cardsData as unknown[]);
const BY_ID = new Map(CATALOG.map(c => [c.id, c]));

function card(id: string): NormalizedCardCatalogEntry {
    const found = BY_ID.get(id);
    if (!found) throw new Error(`catalog is missing card ${id}`);
    return found;
}

function makePlayer(sessionId: string, type: string, level: string, hp: number): PlayerSchema {
    const player = new PlayerSchema();
    player.sessionId = sessionId;
    player.hp = hp;
    const active = new CardSchema();
    active.id = `${sessionId}-active`;
    active.cardKind = "digimon";
    active.type = type;
    active.level = level;
    active.maxHp = 1000;
    active.hp = hp;
    active.circle.damage = 400;
    active.triangle.damage = 300;
    active.cross.damage = 200;
    player.active = active;
    for (let i = 0; i < 3; i++) {
        const c = new CardSchema();
        c.id = `${sessionId}-h${i}`;
        c.cardKind = "digimon";
        player.hand.push(c);
    }
    for (let i = 0; i < 3; i++) {
        const c = new CardSchema();
        c.id = `${sessionId}-k${i}`;
        c.cardKind = "digimon";
        player.deck.push(c);
    }
    return player;
}

/** Play one catalog card as a battle option against a real battle state. */
function play(
    id: string,
    opts: { sourceAttack?: "circle" | "triangle" | "cross"; targetAttack?: "circle" | "triangle" | "cross" } = {}
): { mutated: boolean; self: PlayerSchema; opp: PlayerSchema; unresolved: string[] } {
    const self = makePlayer("a", "Fire", "Champion", 400);
    const opp = makePlayer("d", "Nature", "Champion", 400);
    const ctx = createSupportBattleContext();
    const hpTarget = { hp: self.hp, maxHp: self.active!.maxHp };
    const unresolved: string[] = [];
    const snapshot = () =>
        JSON.stringify([
            [...ctx.attackBonus],
            [...ctx.attackMultiplier],
            [...ctx.attackOverride],
            [...ctx.firstStrikePlayers],
            [...ctx.attackSecondPlayers],
            [...ctx.forcedAttack],
            [...ctx.eatUpHpPlayers],
            [...ctx.counterGrants],
            [...ctx.reviveHp],
            self.hp,
            self.hand.length,
            self.deck.length,
            self.trash.length,
            self.dpSlot.length,
            opp.hp,
            opp.hand.length,
            opp.deck.length,
            opp.active!.type,
        ]);
    const before = snapshot();
    applyBattleOptionToContext(optionLike(card(id)), self.sessionId, ctx, hpTarget, {
        source: self,
        target: opp,
        sourceAttack: opts.sourceAttack ?? "circle",
        targetAttack: opts.targetAttack ?? "triangle",
        hooks: {
            rng: () => 0.5,
            drawCards: (p, n) => {
                for (let i = 0; i < n && p.deck.length > 0; i++) p.hand.push(p.deck.shift()!);
            },
        },
        onUnresolved: (reason, detail) => {
            unresolved.push(`${reason}:${JSON.stringify(detail)}`);
        },
    });
    return { mutated: snapshot() !== before, self, opp, unresolved };
}

describe("battle option dispatch (FC-008)", () => {
    it("applies a compose card's clause the old table had no primitive for", () => {
        // 214 Evil Program: "Discard 1 Card in own DP Slot. Discard all foe's Cards in DP Slot."
        // Both clauses were outside the 5-primitive option table, so the whole
        // card no-op'd. The opponent's DP Slot emptying is the observable part.
        const opp = makePlayer("d", "Nature", "Champion", 400);
        for (let i = 0; i < 3; i++) {
            const c = new CardSchema();
            c.id = `d-slot-${i}`;
            c.cardKind = "digimon";
            opp.dpSlot.push(c);
        }
        const self = makePlayer("a", "Fire", "Champion", 400);
        const ctx = createSupportBattleContext();
        const hpTarget = { hp: self.hp, maxHp: self.active!.maxHp };
        applyBattleOptionToContext(optionLike(card("214")), self.sessionId, ctx, hpTarget, {
            source: self,
            target: opp,
            sourceAttack: "circle",
            targetAttack: "triangle",
        });
        expect(opp.dpSlot.length).toBe(0);
    });

    it("resolves a conditional card by reading the locked attacks", () => {
        // 245 Short Lance: "If both attacks are different, own Attack Power is doubled."
        // Pre-fix the conditional branch had no EffectRuntime, so it no-op'd.
        const ctx = createSupportBattleContext();
        const self = makePlayer("a", "Fire", "Champion", 400);
        const opp = makePlayer("d", "Nature", "Champion", 400);
        const hpTarget = { hp: self.hp, maxHp: self.active!.maxHp };
        const applied = applyBattleOptionToContext(
            optionLike(card("245")),
            self.sessionId,
            ctx,
            hpTarget,
            { source: self, target: opp, sourceAttack: "circle", targetAttack: "triangle" }
        );
        expect(applied).toBe(true);
        expect(ctx.attackMultiplier.get("a")).toEqual({ circle: 2, triangle: 2, cross: 2 });
    });

    it("leaves a conditional card inert when its gate is false", () => {
        // Same card, same attacks: the gate must actually gate, not always fire.
        const ctx = createSupportBattleContext();
        const self = makePlayer("a", "Fire", "Champion", 400);
        const opp = makePlayer("d", "Nature", "Champion", 400);
        const hpTarget = { hp: self.hp, maxHp: self.active!.maxHp };
        const applied = applyBattleOptionToContext(
            optionLike(card("245")),
            self.sessionId,
            ctx,
            hpTarget,
            { source: self, target: opp, sourceAttack: "circle", targetAttack: "circle" }
        );
        expect(applied).toBe(false);
        expect(ctx.attackMultiplier.get("a")).toBeUndefined();
    });

    it("applies a specialty-change card the old table had no primitive for", () => {
        // 216 Fire Altar: "Changes opponent's Specialty to Fire. Draw 1 Card..."
        const result = play("216");
        expect(result.mutated).toBe(true);
        expect(result.opp.active!.type).toBe("Fire");
    });

    it("reports an unsupported effect instead of silently doing nothing", () => {
        // 225 Heap of Junk's text has no primitive; pre-fix it reached
        // `default: break` with no signal at all.
        const result = play("225");
        expect(result.mutated).toBe(false);
        expect(result.unresolved).toHaveLength(1);
        expect(result.unresolved[0]).toMatch(/^no_effect_text:/);
    });

    it("still applies the plain primitives the option path always supported", () => {
        const ctx = createSupportBattleContext();
        const self = makePlayer("a", "Fire", "Champion", 400);
        const hpTarget = { hp: 400, maxHp: 1000 };
        const applied = applyBattleOptionToContext(
            optionLike(card("264")),
            self.sessionId,
            ctx,
            hpTarget,
            { source: self, target: makePlayer("d", "Nature", "Champion", 400) }
        );
        expect(applied).toBe(true);
        expect(ctx.attackBonus.get("a")?.circle).toBe(300);
    });
});

describe("option effect classification", () => {
    it("classifies a resolvable card as implemented", () => {
        expect(classifyOptionEffect(optionLike(card("264")))).toEqual({
            implemented: true,
            effectType: "atk_buff",
        });
    });

    it("classifies an unparseable card with a reason and the card id", () => {
        const verdict = classifyOptionEffect(optionLike(card("225")));
        expect(verdict.implemented).toBe(false);
        if (verdict.implemented !== false) throw new Error("unreachable");
        expect(verdict.reason).toBe("no_effect_text");
        expect(verdict.detail.cardId).toBe("225");
    });

    it("classifies an evolution option by its effectId, not its prose", () => {
        // The text is catalog_text, but the runtime reads the effectId.
        expect(classifyOptionEffect(optionLike(card("293")))).toEqual({
            implemented: true,
            effectType: "evolution_option.download",
        });
    });

    it("rejects an evolution option no runtime implements", () => {
        // 300 Digi-devolve carries no effectId at all.
        const verdict = classifyOptionEffect(optionLike(card("300")));
        expect(verdict.implemented).toBe(false);
        if (verdict.implemented !== false) throw new Error("unreachable");
        expect(verdict.reason).toBe("unsupported_effect_id");
    });
});

describe("evolution DP spend", () => {
    it("floors the gauge at zero when the sufficiency gate was skipped", () => {
        expect(spendEvolutionDp(0, 200)).toBe(0);
        expect(spendEvolutionDp(100, 200)).toBe(0);
    });

    it("deducts the adjusted cost when the player can pay", () => {
        expect(spendEvolutionDp(500, 200)).toBe(300);
        expect(spendEvolutionDp(200, 200)).toBe(0);
    });

    it("treats a negative adjusted cost as free", () => {
        expect(spendEvolutionDp(500, -200)).toBe(500);
    });
});

describe("evolution modifier contract", () => {
    it("parses every evolution option into the one declared shape", () => {
        const expected = [
            "armorCrush",
            "deArmor",
            "dpCostDelta",
            "ignoreDp",
            "ignoreLevel",
            "ignoreSpecialty",
            "restoreFullStats",
            "sameLevel",
            "warpSkipLevels",
        ];
        for (const card of CATALOG.filter(c => c.cardKind === "evolution_option" && c.effectId)) {
            expect(Object.keys(parseEvolutionModifiers(optionLike(card))).sort()).toEqual(expected);
        }
    });

    it("accepts a complete modifier set where the gate expects a partial one", () => {
        // One declaration serving both roles: this stops compiling if the two
        // types drift apart again.
        const full: EvolutionModifiers = parseEvolutionModifiers(
            optionLike(card("297"))
        );
        const asGateInput: EvolutionCostModifiers = full;
        const gate = evaluateEvolution(
            { level: "Rookie", type: "Fire" },
            { level: "Ultimate", type: "Fire", evoCost: 50, cardKind: "digimon" },
            50,
            asGateInput
        );
        expect(gate).toEqual({ ok: true });
    });
});
