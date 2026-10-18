import cardsData from "../data/cards.json";
import { loadCardCatalog } from "./cardCatalogLoader";
import { describe, expect, it } from "vitest";
import {
    resolveBattleExchange,
    resolveFullBattle,
    resolveKoScoring,
    type BattleCombatant,
} from "./battleEffectEngine";
import { createSupportBattleContext } from "./supportResolver";

const CATALOG = loadCardCatalog(cardsData as unknown[]);
const CATALOG_BY_ID = new Map(CATALOG.map((card) => [card.id, card]));

function catalogCombatant(sessionId: string, cardId: string, hp: number): BattleCombatant {
    const card = CATALOG_BY_ID.get(cardId);
    if (!card) throw new Error(`Missing catalog card ${cardId}`);
    return {
        sessionId,
        hp,
        maxHp: card.maxHp,
        specialty: card.type,
        active: Object.fromEntries(
            Object.entries(card.attacks).map(([slot, attack]) => [
                slot,
                {
                    damage: attack.damage,
                    name: attack.name,
                    effectId: attack.effectId,
                    effectArgsJson: JSON.stringify(attack.effectArgs),
                },
            ])
        ) as BattleCombatant["active"],
    };
}

function combatant(
    sessionId: string,
    hp: number,
    crossEffectId = "",
    crossDamage = 100,
    crossArgs: Record<string, string | number> = {},
    specialty = "Fire"
): BattleCombatant {
    return {
        sessionId,
        hp,
        maxHp: hp,
        specialty,
        active: {
            circle: { damage: 400 },
            triangle: { damage: 300 },
            cross: {
                damage: crossDamage,
                effectId: crossEffectId,
                effectArgsJson: Object.keys(crossArgs).length ? JSON.stringify(crossArgs) : "",
            },
        },
    };
}

describe("cross.counter (FC-017)", () => {
    it("doubles reflected damage and cancels opponent circle attack", () => {
        const ctx = createSupportBattleContext();
        const p1 = combatant("p1", 500, "cross.counter", 100, {
            targetAttack: "circle",
            multiplier: 2,
        });
        const p2 = combatant("p2", 500);

        const result = resolveFullBattle(p1, p2, "cross", "circle", "p1", ctx);

        // p2 circle (400) * 2 counter = 800 to p2, p1 takes 0
        expect(result.p2Hp).toBe(0);
        expect(result.p1Hp).toBe(500);
        expect(result.events.some(e => e.type === "cross_counter")).toBe(true);
    });

    it("counters opponent Cross when targetAttack is cross", () => {
        const ctx = createSupportBattleContext();
        const p1 = combatant("p1", 800, "cross.counter", 50, {
            targetAttack: "cross",
            multiplier: 2,
        });
        const p2 = combatant("p2", 800, "", 200);

        const result = resolveFullBattle(p1, p2, "cross", "cross", "p1", ctx);

        // Reflects p2 cross 200 * 2 = 400; p1 takes 0
        expect(result.p1Hp).toBe(800);
        expect(result.p2Hp).toBe(400);
        expect(result.events.some((e) => e.type === "cross_counter")).toBe(true);
    });

    it("does not counter circle/triangle when targetAttack is cross", () => {
        const ctx = createSupportBattleContext();
        const attacker = combatant("a", 800, "cross.counter", 50, {
            targetAttack: "cross",
            multiplier: 2,
        });
        const defender = combatant("d", 800);

        const { attackerHp, defenderHp, events } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "cross",
            defenderAttack: "circle",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        expect(events.some((e) => e.type === "cross_counter")).toBe(false);
        expect(defenderHp).toBe(750);
        expect(attackerHp).toBe(400);
    });

    it("wins over Crash on the same direction (Counter zeros incoming)", () => {
        const ctx = createSupportBattleContext();
        const attacker = combatant("a", 400, "cross.crash", 50);
        const defender = combatant("d", 600, "cross.counter", 50, {
            targetAttack: "cross",
            multiplier: 2,
        });

        const { attackerHp, defenderHp, events } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "cross",
            defenderAttack: "cross",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        expect(events.some((e) => e.type === "cross_counter")).toBe(true);
        expect(events.some((e) => e.type === "cross_crash")).toBe(false);
        // Defender counters: reflects attacker's crash-intended path was overwritten —
        // Counter uses pre-crash toDefender (cross AP 50) * 2 = 100 to attacker; defender takes 0
        expect(defenderHp).toBe(600);
        expect(attackerHp).toBe(300);
    });

    it("mutual counters both fire when each targets the other Cross", () => {
        const ctx = createSupportBattleContext();
        const attacker = combatant("a", 1000, "cross.counter", 100, {
            targetAttack: "cross",
            multiplier: 2,
        });
        const defender = combatant("d", 1000, "cross.counter", 150, {
            targetAttack: "cross",
            multiplier: 2,
        });

        const { attackerHp, defenderHp, events } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "cross",
            defenderAttack: "cross",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        const counters = events.filter((e) => e.type === "cross_counter");
        expect(counters).toHaveLength(2);
        // Second counter overwrites the first pair: defender counter last → toAttacker = toDefender*2, toDefender = 0
        // After attacker counter: toDefender = toAttacker(150)*2=300, toAttacker=0
        // After defender counter: toAttacker = toDefender(300)*2=600, toDefender=0
        expect(defenderHp).toBe(1000);
        expect(attackerHp).toBe(400);
    });
    it("resolves actual catalog Counter and to-zero Cross effects", () => {
        const plain = CATALOG.find((card) =>
            card.attacks.circle.damage > 0 &&
            !card.attacks.circle.effectId &&
            card.attacks.cross.damage > 0 &&
            !card.attacks.cross.effectId &&
            !Object.values(card.attacks).some((attack) => attack.effectId === "attack.first_strike")
        )!;
        const counter = resolveFullBattle(
            catalogCombatant("counter", "000", 900),
            catalogCombatant("plain", plain.id, 900),
            "cross",
            "circle",
            "counter",
            createSupportBattleContext()
        );
        expect(counter.p1Hp).toBe(900);
        expect(counter.p2Hp).toBe(Math.max(0, 900 - plain.attacks.circle.damage * 2));

        const toZero = resolveFullBattle(
            catalogCombatant("zero", "004", 900),
            catalogCombatant("plain", plain.id, 900),
            "cross",
            "cross",
            "zero",
            createSupportBattleContext()
        );
        expect(toZero.p1Hp).toBe(900);
        expect(toZero.p2Hp).toBe(450);
    });
});

describe("cross.to_zero (FC-017)", () => {
    it("zeros opponent damage when they use the targeted attack", () => {
        const ctx = createSupportBattleContext();
        const attacker = combatant("a", 600, "cross.to_zero", 50, { targetAttack: "circle" });
        const defender = combatant("d", 600);

        const { defenderHp, attackerHp } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "cross",
            defenderAttack: "circle",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        expect(attackerHp).toBe(600);
        expect(defenderHp).toBe(550);
    });
});

describe("take-turn default (FC-018)", () => {
    it("attacker strikes first and cancels defender hit on KO", () => {
        const ctx = createSupportBattleContext();
        const attacker = combatant("a", 500);
        const defender = combatant("d", 300);

        const { defenderHp, attackerHp, events, strikes } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "circle",
            defenderAttack: "circle",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        expect(defenderHp).toBe(0);
        expect(attackerHp).toBe(500);
        expect(events.some((e) => e.type === "attack_canceled")).toBe(true);
        expect(strikes).toHaveLength(1);
        expect(strikes[0].attackerSessionId).toBe("a");
    });

    it("defender counter-attacks when they survive", () => {
        const ctx = createSupportBattleContext();
        const attacker = combatant("a", 500);
        const defender = combatant("d", 500);

        const { defenderHp, attackerHp, strikes } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "circle",
            defenderAttack: "triangle",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        expect(defenderHp).toBe(100);
        expect(attackerHp).toBe(200);
        expect(strikes).toHaveLength(2);
        expect(strikes[0].attack).toBe("circle");
        expect(strikes[1].attack).toBe("triangle");
    });
});

describe("first strike cancel (FC-018)", () => {
    it("prevents return hit when first striker KOs", () => {
        const ctx = createSupportBattleContext();
        ctx.firstStrikePlayers.add("a");
        const attacker = combatant("a", 500);
        const defender = combatant("d", 300);

        const { defenderHp, attackerHp, events } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "circle",
            defenderAttack: "circle",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        expect(defenderHp).toBe(0);
        expect(attackerHp).toBe(500);
        expect(events.some(e => e.type === "first_strike_cancel")).toBe(true);
    });

    it("honors attack.first_strike on the selected attack (FC-027)", () => {
        const ctx = createSupportBattleContext();
        const attacker = combatant("a", 500, "attack.first_strike", 400);
        const defender = combatant("d", 300);

        const { defenderHp, attackerHp, events } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "cross",
            defenderAttack: "circle",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        expect(defenderHp).toBe(0);
        expect(attackerHp).toBe(500);
        expect(events.some(e => e.type === "first_strike_cancel")).toBe(true);
    });
});

describe("cross.crash and double KO (FC-019)", () => {
    it("deals self HP as damage then KOs self", () => {
        const ctx = createSupportBattleContext();
        const attacker = combatant("a", 400, "cross.crash", 50);
        const defender = combatant("d", 500);

        const { defenderHp, attackerHp } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "cross",
            defenderAttack: "triangle",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        expect(defenderHp).toBe(100);
        expect(attackerHp).toBe(0);
    });

    it("resolves catalog Crash at strike time and cancels the return hit after self-KO", () => {
        const crashCard = CATALOG_BY_ID.get("025")!;
        const firstStrikeCard = CATALOG.find((card) =>
            Object.values(card.attacks).some((attack) => attack.effectId === "attack.first_strike")
        )!;
        const firstStrikeEntry = Object.entries(firstStrikeCard.attacks).find(
            ([, attack]) => attack.effectId === "attack.first_strike"
        )!;
        const firstStrikeSlot = firstStrikeEntry[0] as "circle" | "triangle" | "cross";
        const firstStrikeDamage = firstStrikeEntry[1].damage;

        const afterFirstStrike = resolveFullBattle(
            catalogCombatant("crash", crashCard.id, 900),
            catalogCombatant("first", firstStrikeCard.id, 900),
            "cross",
            firstStrikeSlot,
            "crash",
            createSupportBattleContext()
        );
        expect(afterFirstStrike.p1Hp).toBe(0);
        expect(afterFirstStrike.p2Hp).toBe(900 - (900 - firstStrikeDamage));

        const afterCrash = resolveFullBattle(
            catalogCombatant("crash", crashCard.id, 900),
            catalogCombatant("target", firstStrikeCard.id, 1800),
            "cross",
            "circle",
            "crash",
            createSupportBattleContext()
        );
        expect(afterCrash.p1Hp).toBe(0);
        expect(afterCrash.strikes).toHaveLength(1);
        expect(afterCrash.strikes[0]?.attackerSessionId).toBe("crash");
    });


    it("does not Crash when an actual catalog Cross counter cancels it", () => {
        const crash = resolveFullBattle(
            catalogCombatant("crash", "025", 900),
            catalogCombatant("counter", "001", 900),
            "cross",
            "cross",
            "crash",
            createSupportBattleContext()
        );
        expect(crash.p1Hp).toBe(900);
        expect(crash.p2Hp).toBe(900);
        expect(crash.events.some((event) => event.type === "cross_crash")).toBe(false);
    });
    it("keeps Crash self-KO after Dark Bone's catalog Eat-Up grant", () => {
        const normalCard = CATALOG.find((card) =>
            card.attacks.circle.damage > 0 &&
            card.attacks.circle.damage < 900 &&
            !card.attacks.circle.effectId
        )!;
        const ctx = createSupportBattleContext();
        // Dark Bone (205) grants Eat-Up HP to its owner's selected attack.
        ctx.eatUpHpPlayers.add("crash");
        const result = resolveFullBattle(
            catalogCombatant("normal", normalCard.id, 1800),
            catalogCombatant("crash", "025", 900),
            "circle",
            "cross",
            "normal",
            ctx
        );
        expect(result.p2Hp).toBe(0);
        expect(result.events.some((event) => event.type === "cross_crash")).toBe(true);
    });


    it("awards no points on double KO", () => {
        const scoring = resolveKoScoring(0, 0);
        expect(scoring.isDoubleKo).toBe(true);
        expect(scoring.scoreDelta).toEqual({ p1: 0, p2: 0 });
    });
});

describe("attack.specialty_mult (FC-016)", () => {
    it("triples Cross damage against matching specialty foe", () => {
        const ctx = createSupportBattleContext();
        const attacker = combatant("a", 2000, "attack.specialty_mult", 380, {
            specialty: "Ice",
            multiplier: 3,
        }, "Fire");
        const defender = combatant("d", 2000, "", 100, {}, "Ice");

        const { defenderHp, events } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "cross",
            defenderAttack: "triangle",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        // 380 * 3 = 1140; defender triangle 300
        expect(defenderHp).toBe(2000 - 1140);
        expect(events.some(e => e.type === "specialty_foe_mult")).toBe(true);
    });

    it("does not multiply against a mismatched specialty", () => {
        const ctx = createSupportBattleContext();
        const attacker = combatant("a", 2000, "attack.specialty_mult", 380, {
            specialty: "Ice",
            multiplier: 3,
        }, "Fire");
        const defender = combatant("d", 2000, "", 100, {}, "Fire");

        const { defenderHp, events } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "cross",
            defenderAttack: "triangle",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        expect(defenderHp).toBe(2000 - 380);
        expect(events.some(e => e.type === "specialty_foe_mult")).toBe(false);
    });
    it("resolves catalog specialty-multiplier Cross damage against Ice", () => {
        const iceCard = CATALOG.find((card) => card.type === "Ice" && card.attacks.circle.damage > 0)!;
        const result = resolveFullBattle(
            catalogCombatant("war", "002", 2000),
            catalogCombatant("ice", iceCard.id, 2000),
            "cross",
            "circle",
            "war",
            createSupportBattleContext()
        );
        expect(result.p2Hp).toBe(2000 - 380 * 3);
    });
});

describe("cross.eat_up_hp (FC-017)", () => {

    it("heals only actual HP lost (300 into 200 HP → heal 200)", () => {
        const ctx = createSupportBattleContext();
        const attacker: BattleCombatant = {
            ...combatant("a", 400, "cross.eat_up_hp", 300),
            maxHp: 1000,
        };
        const defender = combatant("d", 200);

        const { defenderHp, attackerHp, events } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "cross",
            defenderAttack: "triangle",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        expect(defenderHp).toBe(0);
        expect(attackerHp).toBe(600);
        const eat = events.find((e) => e.type === "cross_eat_up_hp");
        expect(eat?.detail?.healed).toBe(200);
    });

    it("does not feed eat-up from a canceled return hit", () => {
        const ctx = createSupportBattleContext();
        const attacker = combatant("a", 500);
        const defender: BattleCombatant = {
            ...combatant("d", 100, "cross.eat_up_hp", 300),
            maxHp: 1000,
        };

        const { defenderHp, attackerHp, events } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "circle",
            defenderAttack: "cross",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        expect(defenderHp).toBe(0);
        expect(attackerHp).toBe(500);
        expect(events.some((e) => e.type === "attack_canceled")).toBe(true);
        expect(events.some((e) => e.type === "cross_eat_up_hp")).toBe(false);
    });
    it("resolves catalog and support-granted Eat-Up before the return hit without resurrecting", () => {
        const lowAttack = CATALOG.flatMap((card) =>
            Object.entries(card.attacks)
                .filter(([, attack]) => !attack.effectId && attack.damage > 100 && attack.damage <= 250)
                .map(([slot, attack]) => ({
                    card,
                    slot: slot as "circle" | "triangle" | "cross",
                    damage: attack.damage,
                }))
        ).find(({ card }) =>
            !Object.values(card.attacks).some((attack) => attack.effectId === "attack.first_strike")
        );
        const highAttack = CATALOG.flatMap((card) =>
            Object.entries(card.attacks)
                .filter(([, attack]) => !attack.effectId && attack.damage > 300)
                .map(([slot, attack]) => ({
                    card,
                    slot: slot as "circle" | "triangle" | "cross",
                    damage: attack.damage,
                }))
        ).find(({ card }) =>
            !Object.values(card.attacks).some((attack) => attack.effectId === "attack.first_strike")
        );
        if (!lowAttack || !highAttack) throw new Error("Catalog lacks ordinary return attack fixtures");

        const intrinsic = resolveFullBattle(
            catalogCombatant("eater", "003", 100),
            catalogCombatant("target", lowAttack.card.id, 900),
            "cross",
            lowAttack.slot,
            "eater",
            createSupportBattleContext()
        );
        expect(intrinsic.p1Hp).toBe(300 - lowAttack.damage);

        const grantedCtx = createSupportBattleContext();
        grantedCtx.eatUpHpPlayers.add("eater");
        const ordinaryAttacker = CATALOG.find((card) => card.id !== "003" && card.maxHp > 100 && card.attacks.cross.damage > 0 && !card.attacks.cross.effectId)!;
        const granted = resolveFullBattle(
            catalogCombatant("eater", ordinaryAttacker.id, 100),
            catalogCombatant("target", lowAttack.card.id, 900),
            "cross",
            lowAttack.slot,
            "eater",
            grantedCtx
        );
        expect(granted.p1Hp).toBe(Math.min(ordinaryAttacker.maxHp, 100 + ordinaryAttacker.attacks.cross.damage) - lowAttack.damage);

        const lethalReturn = resolveFullBattle(
            catalogCombatant("eater", "003", 100),
            catalogCombatant("target", highAttack.card.id, 900),
            "cross",
            highAttack.slot,
            "eater",
            createSupportBattleContext()
        );
        expect(lethalReturn.p1Hp).toBe(0);
    });


    it("caps Eat-Up at max HP before the return hit", () => {
        const ctx = createSupportBattleContext();
        const attacker: BattleCombatant = {
            ...combatant("a", 900, "cross.eat_up_hp", 200),
            maxHp: 1000,
        };
        const defender = combatant("d", 800);

        const { attackerHp, events } = resolveBattleExchange({
            attacker,
            defender,
            attackerAttack: "cross",
            defenderAttack: "triangle",
            activeSessionId: "a",
            supportCtx: ctx,
        });

        // Heal 900 + 200 to the 1000 cap, then take the 300-damage return.
        expect(events.find(e => e.type === "cross_eat_up_hp")?.detail?.healed).toBe(100);
        expect(attackerHp).toBe(700);
    });
});
