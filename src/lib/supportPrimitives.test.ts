import { describe, expect, it } from "vitest";
import { CardSchema, PlayerSchema, SupportEffectSchema } from "../schema/BattleState";
import {
    createSupportBattleContext,
    getEffectiveAttackDamage,
    resolveSupportPhase,
    type AttackType,
} from "./supportResolver";
import { resolveFullBattle, type BattleCombatant } from "./battleEffectEngine";

function makePlayer(sessionId: string, specialty = "Fire", hp = 1000): PlayerSchema {
    const p = new PlayerSchema();
    p.sessionId = sessionId;
    p.hp = hp;
    const active = new CardSchema();
    active.id = `${sessionId}-active`;
    active.cardKind = "digimon";
    active.type = specialty;
    active.level = "Champion";
    active.maxHp = hp;
    active.hp = hp;
    active.circle.damage = 400;
    active.triangle.damage = 300;
    active.cross.damage = 200;
    p.active = active;
    return p;
}

function sup(
    type: string,
    extras: { value?: number; targetAttack?: string; description?: string } = {}
): CardSchema {
    const card = new CardSchema();
    card.id = `sup-${type}`;
    card.cardKind = "digimon";
    const se = new SupportEffectSchema();
    se.type = type;
    se.value = extras.value ?? 0;
    se.targetAttack = extras.targetAttack ?? "";
    se.description = extras.description ?? "";
    card.supportEffect = se;
    return card;
}

/** Resolve `activeSupport` played by the active player and return the ctx. */
function resolveActive(
    active: PlayerSchema,
    defender: PlayerSchema,
    activeSupport: CardSchema,
    locked?: { activeAttack?: AttackType | null; defenderAttack?: AttackType | null }
) {
    const ctx = createSupportBattleContext();
    resolveSupportPhase(active, defender, activeSupport, null, ctx, undefined, undefined, locked);
    return ctx;
}

describe("attack-power primitives (FC-027)", () => {
    it("atk_set overrides own attack power (all slots)", () => {
        const a = makePlayer("a");
        const d = makePlayer("d", "Ice");
        const ctx = resolveActive(a, d, sup("atk_set", { value: 300, targetAttack: "all" }));
        expect(getEffectiveAttackDamage(a, "circle", ctx)).toBe(300);
        expect(getEffectiveAttackDamage(a, "cross", ctx)).toBe(300);
    });

    it("atk_set overrides a single slot only", () => {
        const a = makePlayer("a");
        const d = makePlayer("d", "Ice");
        const ctx = resolveActive(a, d, sup("atk_set", { value: 0, targetAttack: "circle" }));
        expect(getEffectiveAttackDamage(a, "circle", ctx)).toBe(0);
        expect(getEffectiveAttackDamage(a, "triangle", ctx)).toBe(300);
    });

    it("enemy_atk_zero / lower / halve / mult / set target the opponent", () => {
        const d = makePlayer("d", "Ice");
        expect(
            getEffectiveAttackDamage(d, "circle", resolveActive(makePlayer("a"), d, sup("enemy_atk_zero", { targetAttack: "all" })))
        ).toBe(0);

        const d2 = makePlayer("d", "Ice");
        expect(
            getEffectiveAttackDamage(d2, "circle", resolveActive(makePlayer("a"), d2, sup("enemy_atk_lower", { value: 250 })))
        ).toBe(150);

        const d3 = makePlayer("d", "Ice");
        expect(
            getEffectiveAttackDamage(d3, "circle", resolveActive(makePlayer("a"), d3, sup("enemy_atk_halve")))
        ).toBe(200);

        const d4 = makePlayer("d", "Ice");
        expect(
            getEffectiveAttackDamage(d4, "circle", resolveActive(makePlayer("a"), d4, sup("enemy_atk_mult", { value: 2 })))
        ).toBe(800);

        const d5 = makePlayer("d", "Ice");
        expect(
            getEffectiveAttackDamage(d5, "circle", resolveActive(makePlayer("a"), d5, sup("enemy_atk_set", { value: 300 })))
        ).toBe(300);
    });

    it("atk_set_to_hp and atk_add_hp read current HP", () => {
        const a = makePlayer("a", "Fire", 700);
        const ctx = resolveActive(a, makePlayer("d", "Ice"), sup("atk_set_to_hp", { targetAttack: "all" }));
        expect(getEffectiveAttackDamage(a, "circle", ctx)).toBe(700);

        const a2 = makePlayer("a", "Fire", 500);
        const ctx2 = resolveActive(a2, makePlayer("d", "Ice"), sup("atk_add_hp"));
        expect(getEffectiveAttackDamage(a2, "circle", ctx2)).toBe(900);
    });
});

describe("HP primitives (FC-027)", () => {
    it("hp_set / enemy_hp_set", () => {
        const a = makePlayer("a", "Fire", 1000);
        const d = makePlayer("d", "Ice", 1000);
        resolveActive(a, d, sup("hp_set", { value: 700 }));
        expect(a.hp).toBe(700);

        const a2 = makePlayer("a", "Fire", 1000);
        const d2 = makePlayer("d", "Ice", 1000);
        resolveActive(a2, d2, sup("enemy_hp_set", { value: 10 }));
        expect(d2.hp).toBe(10);
    });

    it("hp_double / enemy_hp_double", () => {
        const a = makePlayer("a", "Fire", 500);
        const d = makePlayer("d", "Ice", 500);
        resolveActive(a, d, sup("hp_double"));
        expect(a.hp).toBe(1000);

        const a2 = makePlayer("a", "Fire", 500);
        const d2 = makePlayer("d", "Ice", 400);
        resolveActive(a2, d2, sup("enemy_hp_double"));
        expect(d2.hp).toBe(800);
    });

    it("hp_swap / hp_copy_from_opponent / enemy_hp_copy_from_own", () => {
        const a = makePlayer("a", "Fire", 400);
        const d = makePlayer("d", "Ice", 900);
        resolveActive(a, d, sup("hp_swap"));
        expect(a.hp).toBe(900);
        expect(d.hp).toBe(400);

        const a2 = makePlayer("a", "Fire", 400);
        const d2 = makePlayer("d", "Ice", 900);
        resolveActive(a2, d2, sup("hp_copy_from_opponent"));
        expect(a2.hp).toBe(900);
        expect(d2.hp).toBe(900);

        const a3 = makePlayer("a", "Fire", 400);
        const d3 = makePlayer("d", "Ice", 900);
        resolveActive(a3, d3, sup("enemy_hp_copy_from_own"));
        expect(d3.hp).toBe(400);
    });
});

describe("specialty & attack-change primitives (FC-027)", () => {
    it("change_enemy_specialty / both_change_specialty / swap / becomes_own", () => {
        const a = makePlayer("a", "Fire");
        const d = makePlayer("d", "Ice");
        resolveActive(a, d, sup("change_enemy_specialty", { targetAttack: "Nature" }));
        expect(d.active?.type).toBe("Nature");

        const a2 = makePlayer("a", "Fire");
        const d2 = makePlayer("d", "Ice");
        resolveActive(a2, d2, sup("both_change_specialty", { targetAttack: "Rare" }));
        expect(a2.active?.type).toBe("Rare");
        expect(d2.active?.type).toBe("Rare");

        const a3 = makePlayer("a", "Fire");
        const d3 = makePlayer("d", "Ice");
        resolveActive(a3, d3, sup("swap_specialty"));
        expect(a3.active?.type).toBe("Ice");
        expect(d3.active?.type).toBe("Fire");

        const a4 = makePlayer("a", "Fire");
        const d4 = makePlayer("d", "Ice");
        resolveActive(a4, d4, sup("enemy_specialty_becomes_own"));
        expect(d4.active?.type).toBe("Fire");
    });

    it("force_self_attack sets own forced attack", () => {
        const a = makePlayer("a");
        const ctx = resolveActive(a, makePlayer("d", "Ice"), sup("force_self_attack", { targetAttack: "cross" }));
        expect(ctx.forcedAttack.get("a")).toBe("cross");
    });

    it("rotate_enemy_attack rotates opponent's locked attack", () => {
        const a = makePlayer("a");
        const d = makePlayer("d", "Ice");
        const ctx = resolveActive(a, d, sup("rotate_enemy_attack"), {
            activeAttack: "circle",
            defenderAttack: "circle",
        });
        expect(ctx.forcedAttack.get("d")).toBe("triangle");
    });

    it("copy_opponent_stats copies attack, HP, and specialty", () => {
        const a = makePlayer("a", "Fire", 500);
        const d = makePlayer("d", "Ice", 1200);
        d.active!.circle.damage = 999;
        const ctx = resolveActive(a, d, sup("copy_opponent_stats"));
        expect(getEffectiveAttackDamage(a, "circle", ctx)).toBe(999);
        expect(a.hp).toBe(1200);
        expect(a.active?.type).toBe("Ice");
    });
});

describe("conditional support effects (FC-027)", () => {
    it("fires consequent only when the gate passes", () => {
        const a = makePlayer("a");
        const d = makePlayer("d", "Ice");
        const card = sup("conditional", {
            description: "If both attacks are different, own Attack Power is doubled",
        });
        const ctx = resolveSupportPhaseWith(a, d, card, { activeAttack: "circle", defenderAttack: "cross" });
        expect(getEffectiveAttackDamage(a, "circle", ctx)).toBe(800);
    });

    it("skips consequent when the gate fails", () => {
        const a = makePlayer("a");
        const d = makePlayer("d", "Ice");
        const card = sup("conditional", {
            description: "If both attacks are different, own Attack Power is doubled",
        });
        const ctx = resolveSupportPhaseWith(a, d, card, { activeAttack: "circle", defenderAttack: "circle" });
        expect(getEffectiveAttackDamage(a, "circle", ctx)).toBe(400);
    });

    it("applies an &-joined consequent (ATK + HP)", () => {
        const a = makePlayer("a", "Fire", 500);
        a.active!.maxHp = 1000; // headroom so the +200 heal is not capped
        const d = makePlayer("d", "Dark");
        const card = sup("conditional", {
            description: "If opponent's Specialty is Darkness, own Attack Power is +200 & HP +200",
        });
        const ctx = resolveSupportPhaseWith(a, d, card, { activeAttack: "circle", defenderAttack: "circle" });
        expect(getEffectiveAttackDamage(a, "circle", ctx)).toBe(600);
        expect(a.hp).toBe(700);
    });

    function resolveSupportPhaseWith(
        a: PlayerSchema,
        d: PlayerSchema,
        card: CardSchema,
        locked: { activeAttack?: AttackType | null; defenderAttack?: AttackType | null }
    ) {
        const ctx = createSupportBattleContext();
        resolveSupportPhase(a, d, card, null, ctx, undefined, undefined, locked);
        return ctx;
    }
});

function addDpCards(player: PlayerSchema, n: number, plusDp = 10) {
    for (let i = 0; i < n; i++) {
        const c = new CardSchema();
        c.id = `${player.sessionId}-dp-${i}`;
        c.cardKind = "digimon";
        c.plusDp = plusDp;
        player.dpSlot.push(c);
    }
    player.dp += n * plusDp;
}

describe("DP-slot primitives (FC-027)", () => {
    it("atk_add_dp_count adds (DP card count × per) to own attack", () => {
        const a = makePlayer("a");
        addDpCards(a, 3);
        const ctx = resolveActive(a, makePlayer("d", "Ice"), sup("atk_add_dp_count", { value: 100 }));
        expect(getEffectiveAttackDamage(a, "circle", ctx)).toBe(700); // 400 + 3×100
    });

    it("hp_add_dp_count adds (count × per) to own HP", () => {
        const a = makePlayer("a", "Fire", 500);
        a.active!.maxHp = 2000;
        addDpCards(a, 2);
        resolveActive(a, makePlayer("d", "Ice"), sup("hp_add_dp_count", { value: 100 }));
        expect(a.hp).toBe(700);
    });

    it("discard_own_dp removes N DP cards and reduces DP", () => {
        const a = makePlayer("a");
        addDpCards(a, 3); // dp = 30, slot = 3
        resolveActive(a, makePlayer("d", "Ice"), sup("discard_own_dp", { value: 2 }));
        expect(a.dpSlot.length).toBe(1);
        expect(a.dp).toBe(10);
        expect(a.trash.length).toBe(2);
    });

    it("discard_enemy_dp removes the opponent's DP cards", () => {
        const a = makePlayer("a");
        const d = makePlayer("d", "Ice");
        addDpCards(d, 2);
        resolveActive(a, d, sup("discard_enemy_dp", { value: 0 })); // 0 = all
        expect(d.dpSlot.length).toBe(0);
        expect(d.dp).toBe(0);
    });

    it("atk_mult_by_dp_discards multiplies by the number discarded, emptying the slot", () => {
        const a = makePlayer("a");
        addDpCards(a, 2);
        const ctx = resolveActive(a, makePlayer("d", "Ice"), sup("atk_mult_by_dp_discards", { targetAttack: "all" }));
        expect(a.dpSlot.length).toBe(0);
        expect(getEffectiveAttackDamage(a, "circle", ctx)).toBe(800); // 400 × 2
    });

    it("conditional gate reads opponent DP-slot count", () => {
        const a = makePlayer("a");
        const d = makePlayer("d", "Ice");
        addDpCards(d, 3);
        const card = sup("conditional", {
            description: "If opponent has more than 2 Cards in DP Slot, opponent's Attack Power becomes 0",
        });
        const ctx = createSupportBattleContext();
        resolveSupportPhase(a, d, card, null, ctx, undefined, undefined, {
            activeAttack: "circle",
            defenderAttack: "circle",
        });
        expect(getEffectiveAttackDamage(d, "circle", ctx)).toBe(0);
    });
});

describe("grant_counter (FC-027)", () => {
    function combatant(sessionId: string, hp: number, damage: number): BattleCombatant {
        return {
            sessionId,
            hp,
            maxHp: hp,
            specialty: "Fire",
            active: { circle: { damage }, triangle: { damage }, cross: { damage } },
        };
    }

    it("reflects and nullifies a matching incoming attack", () => {
        const attacker = combatant("atk", 1000, 400);
        const defender = combatant("def", 1000, 200);
        const ctx = createSupportBattleContext();
        ctx.counterGrants.set("def", { targetAttack: "circle", multiplier: 2 });
        // Attacker uses circle → defender's granted circle-counter reflects 400×2 = 800.
        const r = resolveFullBattle(attacker, defender, "circle", "cross", "atk", ctx);
        expect(r.p2Hp).toBe(1000); // defender took no damage
        expect(r.p1Hp).toBe(200); // attacker took reflected 800
    });

    it("does not fire when the incoming attack does not match", () => {
        const attacker = combatant("atk", 1000, 400);
        const defender = combatant("def", 1000, 200);
        const ctx = createSupportBattleContext();
        ctx.counterGrants.set("def", { targetAttack: "circle", multiplier: 2 });
        // Attacker uses triangle → no counter; normal take-turn trade.
        const r = resolveFullBattle(attacker, defender, "triangle", "cross", "atk", ctx);
        expect(r.p2Hp).toBe(600); // defender took attacker's triangle 400
        expect(r.p1Hp).toBe(800); // attacker took defender's cross 200
    });
});

describe("attack_second ordering (FC-027)", () => {
    function combatant(sessionId: string, hp: number, damage: number): BattleCombatant {
        return {
            sessionId,
            hp,
            maxHp: hp,
            specialty: "Fire",
            active: {
                circle: { damage },
                triangle: { damage },
                cross: { damage },
            },
        };
    }

    it("forces the holder to strike second, yielding priority to the opponent", () => {
        const attacker = combatant("atk", 500, 100);
        const defender = combatant("def", 500, 1000);

        // Baseline take-turn: attacker strikes first, trades into defender (500 - 100 = 400).
        const base = resolveFullBattle(attacker, defender, "circle", "circle", "atk", createSupportBattleContext());
        expect(base.p2Hp).toBe(400);
        expect(base.p1Hp).toBe(0);

        // attack_second on the attacker → defender strikes first and KOs, canceling attacker's hit.
        const ctx = createSupportBattleContext();
        ctx.attackSecondPlayers.add("atk");
        const second = resolveFullBattle(attacker, defender, "circle", "circle", "atk", ctx);
        expect(second.p2Hp).toBe(500);
        expect(second.p1Hp).toBe(0);
    });
});
