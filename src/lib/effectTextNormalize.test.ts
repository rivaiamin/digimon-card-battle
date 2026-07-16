import { describe, expect, it } from "vitest";
import {
    inferCompoundSupportEffect,
    inferSupportEffectFromDescription,
    parseAttackEffectFromDescription,
    splitEffectClauses,
} from "./effectTextNormalize";
import { loadCardCatalog } from "./cardCatalogLoader";
import {
    createSupportBattleContext,
    getEffectiveAttackDamage,
    resolveSupportPhase,
} from "./supportResolver";
import { CardSchema, PlayerSchema, SupportEffectSchema } from "../schema/BattleState";
import cardsData from "../data/cards.json";

describe("effectTextNormalize (FC-026 / FC-027)", () => {
    it("maps attack descriptions to effect ids", () => {
        expect(parseAttackEffectFromDescription("1st Attack")).toEqual({
            effectId: "attack.first_strike",
            effectArgs: {},
        });
        expect(parseAttackEffectFromDescription("Jamming")).toEqual({
            effectId: "attack.jamming",
            effectArgs: {},
        });
        expect(parseAttackEffectFromDescription("Ice Foe x3")).toEqual({
            effectId: "attack.specialty_mult",
            effectArgs: { specialty: "Ice", multiplier: 3 },
        });
    });

    it("promotes exact-match and compound support catalog text", () => {
        expect(inferSupportEffectFromDescription("Recover own HP by +300")).toEqual({
            type: "hp_heal",
            value: 300,
            description: "Recover own HP by +300",
        });
        expect(inferSupportEffectFromDescription("Boost own Attack Power by +100")).toEqual({
            type: "atk_buff",
            targetAttack: "all",
            value: 100,
            description: "Boost own Attack Power by +100",
        });
        expect(inferCompoundSupportEffect("Attack first. Boost own Attack Power +100.")).toEqual({
            type: "compose",
            description: "Attack first. Boost own Attack Power +100.",
        });
        expect(
            splitEffectClauses('Attack first. Own attack becomes "Eat-up HP." Boost Attack Power +200.')
        ).toEqual([
            "Attack first",
            'Own attack becomes "Eat-up HP',
            "Boost Attack Power +200",
        ]);
        expect(
            inferCompoundSupportEffect(
                'Attack first. Own attack becomes "Eat-up HP." Boost Attack Power +200.'
            )?.type
        ).toBe("compose");
    });

    it("normalizes 1st Attack / Jamming on loaded catalog cards", () => {
        const cat = loadCardCatalog(cardsData);
        const firstStrike = cat.find(c => c.attacks.cross.description === "1st Attack");
        expect(firstStrike?.attacks.cross.effectId).toBe("attack.first_strike");

        const jamming = cat.find(c => c.attacks.cross.description === "Jamming");
        expect(jamming?.attacks.cross.effectId).toBe("attack.jamming");
    });

    it("represents full Digimon / Option / Evolution taxonomy", () => {
        const cat = loadCardCatalog(cardsData);
        const kinds = new Set(cat.map(c => c.cardKind));
        expect(kinds.has("digimon")).toBe(true);
        expect(kinds.has("option")).toBe(true);
        expect(kinds.has("evolution_option")).toBe(true);
    });
});

describe("parser hardening (FC-027 Phase 2 Layer A)", () => {
    it("strips quotes before the trailing period (Eat-up HP)", () => {
        expect(inferSupportEffectFromDescription('Own attack becomes "Eat-up HP."')).toMatchObject({
            type: "grant_eat_up_hp",
        });
    });

    it("canonicalizes synonyms (his/foe's → opponent's, Atk Pwr → Attack Power)", () => {
        expect(inferSupportEffectFromDescription("his Attack Power goes to 0")).toMatchObject({
            type: "enemy_atk_zero",
        });
        expect(inferSupportEffectFromDescription("opponent's Atk Pwr becomes 0")).toMatchObject({
            type: "enemy_atk_set",
            value: 0,
        });
    });

    it("splits conditional consequents on comma and 'and'", () => {
        expect(
            inferCompoundSupportEffect(
                "If own Specialty is Fire, boost own Attack Power +100, recover HP +200"
            )?.type
        ).toBe("conditional");
        expect(
            inferCompoundSupportEffect(
                "If opponent uses Circle, attack first and boost own Attack Power +500"
            )?.type
        ).toBe("conditional");
        expect(
            inferCompoundSupportEffect("If foe's Specialty is Fire or Ice, his Attack Power goes to 0")
                ?.type
        ).toBe("conditional");
    });

    it("maps counterattack clauses", () => {
        expect(inferSupportEffectFromDescription("Circle Counterattack")).toMatchObject({
            type: "grant_counter",
            targetAttack: "circle",
        });
        expect(inferCompoundSupportEffect("Cross Counterattack. Attack second.")?.type).toBe("compose");
    });
});

describe("support compose effects (FC-027)", () => {
    function makePlayer(sessionId: string, specialty = "Fire", hp = 1000): PlayerSchema {
        const p = new PlayerSchema();
        p.sessionId = sessionId;
        p.hp = hp;
        const active = new CardSchema();
        active.id = `${sessionId}-active`;
        active.cardKind = "digimon";
        active.type = specialty;
        active.maxHp = hp;
        active.hp = hp;
        active.circle.damage = 400;
        active.triangle.damage = 300;
        active.cross.damage = 200;
        p.active = active;
        return p;
    }

    it("applies Attack first + ATK buff from compose description", () => {
        const active = makePlayer("a");
        const defender = makePlayer("d", "Ice");
        const card = new CardSchema();
        card.id = "compose";
        card.cardKind = "digimon";
        const se = new SupportEffectSchema();
        se.type = "compose";
        se.description = "Attack first. Boost own Attack Power +100.";
        card.supportEffect = se;

        const ctx = createSupportBattleContext();
        resolveSupportPhase(active, defender, card, null, ctx);
        expect(ctx.firstStrikePlayers.has("a")).toBe(true);
        expect(getEffectiveAttackDamage(active, "circle", ctx)).toBe(500);
    });

    it("changes specialty and heals from compose description", () => {
        const active = makePlayer("a", "Fire", 500);
        active.active!.maxHp = 1000;
        const defender = makePlayer("d");
        const card = new CardSchema();
        card.id = "ice";
        card.cardKind = "digimon";
        const se = new SupportEffectSchema();
        se.type = "compose";
        se.description = "Change own Specialty to Ice. Recover own HP by +200.";
        card.supportEffect = se;

        const ctx = createSupportBattleContext();
        resolveSupportPhase(active, defender, card, null, ctx);
        expect(active.active?.type).toBe("Ice");
        expect(active.hp).toBe(700);
    });
});
