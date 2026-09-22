/**
 * Support ordering, RA-006 tie-break, and the shipped damage arithmetic order.
 * @see docs/fidelity-rules-contract.md FC-014, FC-018, FC-020, RA-006
 * @see scripts/verify-resolution-order.ts (gates G1–G3)
 */

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { CardSchema, PlayerSchema, SupportEffectSchema } from "../schema/BattleState";
import { resolveFullBattle, type BattleCombatant } from "./battleEffectEngine";
import {
    createSupportBattleContext,
    effectClassPriority,
    effectPriority,
    getAttackDamageBreakdown,
    resolveSupportPhase,
    type AttackType,
    type SupportBattleContext,
} from "./supportResolver";

function makePlayer(sessionId: string, crossEffectId = "", hp = 1000): PlayerSchema {
    const p = new PlayerSchema();
    p.sessionId = sessionId;
    p.hp = hp;
    const active = new CardSchema();
    active.id = `${sessionId}-active`;
    active.cardKind = "digimon";
    active.type = "Fire";
    active.maxHp = hp;
    active.hp = hp;
    active.circle.damage = 400;
    active.triangle.damage = 300;
    active.cross.damage = 200;
    active.cross.effectId = crossEffectId;
    p.active = active;
    return p;
}

/** The battle engine reads `BattleCombatant`, not `PlayerSchema`. */
function toCombatant(player: PlayerSchema): BattleCombatant {
    const active = player.active;
    return {
        sessionId: player.sessionId,
        hp: player.hp,
        maxHp: active?.maxHp ?? player.hp,
        specialty: active?.type ?? "",
        active: active
            ? {
                  circle: { damage: active.circle.damage, effectId: active.circle.effectId },
                  triangle: { damage: active.triangle.damage, effectId: active.triangle.effectId },
                  cross: { damage: active.cross.damage, effectId: active.cross.effectId },
              }
            : null,
    };
}

function supportCard(
    id: string,
    type: string,
    value = 0,
    priority = 2,
    description = "",
    targetAttack = ""
): CardSchema {
    const card = new CardSchema();
    card.id = id;
    card.cardKind = "digimon";
    const se = new SupportEffectSchema();
    se.type = type;
    se.value = value;
    se.priority = priority;
    se.description = description;
    se.targetAttack = targetAttack;
    card.supportEffect = se;
    return card;
}

/**
 * Reveal one support pair and report the active player's HP once both effects
 * have landed, plus the context the stack mutated. HP is the probe because
 * `hp_set` / `enemy_hp_copy_from_own` are order-sensitive: the last writer wins,
 * so the number identifies which side's effect ran first.
 */
function revealSupport(
    active: PlayerSchema,
    defender: PlayerSchema,
    activeCard: CardSchema | null,
    defenderCard: CardSchema | null,
    ctx = createSupportBattleContext(),
    defenderAttack: AttackType = "cross"
): { hp: number; ctx: SupportBattleContext } {
    resolveSupportPhase(
        active,
        defender,
        activeCard,
        defenderCard,
        ctx,
        { activeSessionId: active.sessionId, sessionOrder: [active.sessionId, defender.sessionId] },
        undefined,
        { activeAttack: "circle", defenderAttack }
    );
    return { hp: active.hp, ctx };
}

describe("RA-006 tie-break input (FC-014 / FC-020)", () => {
    it("lets an attack-slot first-strike holder into the support tie-break", () => {
        // The defender owns first strike through the locked Cross slot, not a
        // support card. Equal declared speed, so RA-006 step 2 decides.
        const active = makePlayer("a");
        const defender = makePlayer("d", "attack.first_strike");

        const { hp } = revealSupport(
            active,
            defender,
            supportCard("a-set", "hp_set", 100),
            supportCard("d-copy", "enemy_hp_copy_from_own")
        );

        // Defender's effect runs first: copy d.hp (1000) onto a, then a sets 100.
        // Without the attack slot reaching the tie-break the active player runs
        // first and the order reverses, leaving a.hp at 1000.
        expect(hp).toBe(100);
    });

    it("falls back to the active player when neither side holds first strike", () => {
        const active = makePlayer("a");
        const defender = makePlayer("d");

        const { hp } = revealSupport(
            active,
            defender,
            supportCard("a-set", "hp_set", 100),
            supportCard("d-copy", "enemy_hp_copy_from_own")
        );

        // Active player first: a sets 100, then d copies its own 1000 over it.
        expect(hp).toBe(1000);
    });

    it("reaches the same order from the support-granted first-strike source", () => {
        const active = makePlayer("a");
        const defender = makePlayer("d");
        const ctx = createSupportBattleContext();
        // Exactly what `case "first_strike"` in applySingleEffect records.
        ctx.firstStrikePlayers.add("d");

        const { hp } = revealSupport(
            active,
            defender,
            supportCard("a-set", "hp_set", 100),
            supportCard("d-copy", "enemy_hp_copy_from_own"),
            ctx
        );

        expect(hp).toBe(100);
    });

    it("orders the exchange the same way the support stack does", () => {
        const battle = resolveFullBattle(
            toCombatant(makePlayer("a")),
            toCombatant(makePlayer("d", "attack.first_strike")),
            "circle",
            "cross",
            "a",
            createSupportBattleContext()
        );

        expect(battle.strikes[0]?.attackerSessionId).toBe("d");
    });

    it("records the attack-slot source in firstStrikePlayers itself", () => {
        // `firstStrikePlayers` is the carrier every reader consults; an
        // attack-slot holder missing from it is the original defect, not just a
        // private ordering detail.
        const { ctx } = revealSupport(
            makePlayer("a"),
            makePlayer("d", "attack.first_strike"),
            supportCard("a-set", "hp_set", 100),
            supportCard("d-copy", "enemy_hp_copy_from_own")
        );

        expect([...ctx.firstStrikePlayers]).toEqual(["d"]);
    });

    it("records the support-granted source and both sources together", () => {
        const supportGranted = revealSupport(
            makePlayer("a"),
            makePlayer("d"),
            supportCard("a-first", "first_strike", 0, 1),
            supportCard("d-copy", "enemy_hp_copy_from_own")
        );
        expect([...supportGranted.ctx.firstStrikePlayers]).toEqual(["a"]);

        const both = revealSupport(
            makePlayer("a"),
            makePlayer("d", "attack.first_strike"),
            supportCard("a-first", "first_strike", 0, 1),
            supportCard("d-copy", "enemy_hp_copy_from_own")
        );
        expect([...both.ctx.firstStrikePlayers].sort()).toEqual(["a", "d"]);
    });

    it("keeps firstStrikePlayers empty when nobody holds it", () => {
        const { ctx } = revealSupport(
            makePlayer("a"),
            makePlayer("d"),
            supportCard("a-set", "hp_set", 100),
            supportCard("d-copy", "enemy_hp_copy_from_own")
        );

        expect([...ctx.firstStrikePlayers]).toEqual([]);
    });

    it("re-reads the attack slot after a support-forced attack change", () => {
        // The defender's locked Cross holds first strike, but the active player's
        // support forces both onto Circle. Recording the pre-support attack would
        // leave a stale first-strike holder in the set.
        const { ctx } = revealSupport(
            makePlayer("a"),
            makePlayer("d", "attack.first_strike"),
            supportCard("a-force", "both_change_attack", 0, 2, "", "circle"),
            supportCard("d-buff", "atk_buff", 100, 2)
        );

        expect([...ctx.forcedAttack]).toEqual([["a", "circle"], ["d", "circle"]]);
        expect([...ctx.firstStrikePlayers]).toEqual([]);
    });
});

describe("ordering authority and the §2B fallback (D1 / FC-020)", () => {
    it("reads every catalog card's speed from its declared priority alone", () => {
        const raw = JSON.parse(
            readFileSync(new URL("../data/cards.json", import.meta.url), "utf8")
        ) as { cards?: unknown[] } | unknown[];
        const cards = (Array.isArray(raw) ? raw : raw.cards ?? []) as {
            supportEffect?: { type: string; priority?: number };
        }[];
        const declared = cards.filter(c => (c.supportEffect?.priority ?? 0) > 0);

        expect(declared.length).toBeGreaterThan(0);
        for (const card of declared) {
            expect(effectPriority(card.supportEffect!)).toBe(card.supportEffect!.priority);
        }
    });

    it("keeps the declared speed authoritative over the §2B class", () => {
        const active = makePlayer("a");
        const defender = makePlayer("d");

        // a is the active player but declares the slower speed.
        const { hp } = revealSupport(
            active,
            defender,
            supportCard("a-set", "hp_set", 100, 2),
            supportCard("d-copy", "enemy_hp_copy_from_own", 0, 1)
        );

        expect(hp).toBe(100);
    });

    it("orders equal-speed effects by the §2B class before the active player", () => {
        const active = makePlayer("a");
        const defender = makePlayer("d");
        expect(effectClassPriority(supportCard("x", "enemy_hp_set").supportEffect!)).toBe(3);
        expect(effectClassPriority(supportCard("y", "hp_heal").supportEffect!)).toBe(5);

        // a is active but carries a class-5 recovery effect; d carries a class-3
        // stat setter. Class 3 runs first: set to 100, then heal 500.
        const { hp } = revealSupport(
            active,
            defender,
            supportCard("a-heal", "hp_heal", 500),
            supportCard("d-set", "enemy_hp_set", 100)
        );

        expect(hp).toBe(600);
    });
});

describe("shipped damage arithmetic order (FC-016 / §2B classes 3→4)", () => {
    function composeDamage(description: string): { base: number; total: number } {
        const active = makePlayer("a");
        const ctx = createSupportBattleContext();
        resolveSupportPhase(
            active,
            makePlayer("d"),
            supportCard("a-compose", "compose", 0, 4, description),
            null,
            ctx,
            { activeSessionId: "a", sessionOrder: ["a", "d"] },
            undefined,
            { activeAttack: "circle", defenderAttack: "circle" }
        );
        const breakdown = getAttackDamageBreakdown(active, "circle", ctx);
        return { base: breakdown.baseDamage, total: breakdown.totalDamage };
    }

    it("computes (base + flat) * mult, not (base * mult) + flat", () => {
        const { base, total } = composeDamage(
            "Own Attack Power is doubled. Boost own Attack Power +300."
        );

        expect(base).toBe(400);
        // (400 + 300) * 2 = 1400. The §2B class-ordered reading would be 1100.
        expect(total).toBe(1400);
    });

    it("returns the same number when the compose clause text is reversed", () => {
        const { total } = composeDamage(
            "Boost own Attack Power +300. Own Attack Power is doubled."
        );

        expect(total).toBe(1400);
    });

    it("does not compose clauses owned by different players", () => {
        const active = makePlayer("a");
        const defender = makePlayer("d");
        const ctx = createSupportBattleContext();

        // Multiplier on the defender, flat bonus on the attacker: separate contexts.
        resolveSupportPhase(
            active,
            defender,
            supportCard("a-flat", "atk_buff", 300),
            supportCard("d-mult", "atk_mult", 2),
            ctx,
            { activeSessionId: "a", sessionOrder: ["a", "d"] },
            undefined,
            { activeAttack: "circle", defenderAttack: "circle" }
        );

        // The attacker sees only its own flat bonus; the defender's x2 is its own.
        expect(getAttackDamageBreakdown(active, "circle", ctx).totalDamage).toBe(700);
        expect(getAttackDamageBreakdown(defender, "circle", ctx).totalDamage).toBe(800);
    });
});
