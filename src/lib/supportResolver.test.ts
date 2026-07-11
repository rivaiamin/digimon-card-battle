import { describe, expect, it } from "vitest";
import { SupportEffectSchema, CardSchema, PlayerSchema } from "../schema/BattleState";
import {
    canVoidEnemySupport,
    createSupportBattleContext,
    evaluateSupportNullification,
    getEffectiveAttackDamage,
    resolveSupportPhase,
} from "./supportResolver";
import { applyBattleOptionToContext } from "./optionResolver";

function makePlayer(sessionId: string, specialty: string, hp = 1000): PlayerSchema {
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

function digimonSupport(
    id: string,
    effectType: string,
    extras: { requireType?: string; requireOpponentType?: string; value?: number; targetAttack?: string } = {}
): CardSchema {
    const card = new CardSchema();
    card.id = id;
    card.cardKind = "digimon";
    const se = new SupportEffectSchema();
    se.type = effectType;
    se.value = extras.value ?? 0;
    se.targetAttack = extras.targetAttack ?? "";
    se.requireType = extras.requireType ?? "";
    se.requireOpponentType = extras.requireOpponentType ?? "";
    card.supportEffect = se;
    return card;
}

function battleOption(id: string, value: number): CardSchema {
    const card = new CardSchema();
    card.id = id;
    card.cardKind = "option";
    card.effectId = "option.battle.atk_buff";
    card.effectArgsJson = JSON.stringify({ targetAttack: "circle", value });
    return card;
}

describe("support nullification / jamming (FC-015 / P3-5)", () => {
    it("voids enemy digimon buff before it applies", () => {
        const active = makePlayer("a", "Fire");
        const defender = makePlayer("d", "Ice");
        const voidCard = digimonSupport("void", "void_enemy_support");
        const buff = digimonSupport("buff", "atk_buff", { value: 200, targetAttack: "circle" });
        active.supportCard = voidCard;
        defender.supportCard = buff;

        const ctx = createSupportBattleContext();
        const result = resolveSupportPhase(active, defender, voidCard, buff, ctx);
        expect(result.defenderVoided).toBe(true);
        expect(result.activeVoided).toBe(false);
        expect(getEffectiveAttackDamage(defender, "circle", ctx)).toBe(400);
    });

    it("mutual void cancels both supports", () => {
        const active = makePlayer("a", "Fire");
        const defender = makePlayer("d", "Ice");
        const v1 = digimonSupport("v1", "void_enemy_support");
        const v2 = digimonSupport("v2", "void_enemy_support");
        const result = evaluateSupportNullification(active, defender, v1, v2);
        expect(result.activeVoided).toBe(true);
        expect(result.defenderVoided).toBe(true);
    });

    it("voids battle options before ATK buff applies (cancellation-first)", () => {
        const active = makePlayer("a", "Fire");
        const defender = makePlayer("d", "Nature");
        const option = battleOption("opt", 250);
        const voidCard = digimonSupport("void", "void_enemy_support");
        active.supportCard = option;
        defender.supportCard = voidCard;

        const ctx = createSupportBattleContext();
        const trash: CardSchema[] = [];
        resolveSupportPhase(active, defender, option, voidCard, ctx, undefined, {
            applyBattleOption: (source, card, battleCtx) => {
                applyBattleOptionToContext(
                    {
                        id: card.id,
                        cardKind: card.cardKind,
                        effectId: card.effectId,
                        effectArgs: JSON.parse(card.effectArgsJson || "{}"),
                    },
                    source.sessionId,
                    battleCtx
                );
                trash.push(card);
            },
        });

        expect(trash).toHaveLength(0);
        expect(getEffectiveAttackDamage(active, "circle", ctx)).toBe(400);
        expect(active.supportCard).toBeNull();
    });

    it("allows battle option when enemy has no void", () => {
        const active = makePlayer("a", "Fire");
        const defender = makePlayer("d", "Nature");
        const option = battleOption("opt", 250);
        const ctx = createSupportBattleContext();
        resolveSupportPhase(active, defender, option, null, ctx, undefined, {
            applyBattleOption: (source, card, battleCtx) => {
                applyBattleOptionToContext(
                    {
                        id: card.id,
                        cardKind: card.cardKind,
                        effectId: card.effectId,
                        effectArgs: JSON.parse(card.effectArgsJson || "{}"),
                    },
                    source.sessionId,
                    battleCtx
                );
            },
        });
        expect(getEffectiveAttackDamage(active, "circle", ctx)).toBe(650);
    });

    it("respects requireType on void (own specialty gate)", () => {
        const ice = makePlayer("ice", "Ice");
        const fire = makePlayer("fire", "Fire");
        const opp = makePlayer("opp", "Nature");
        const gated = digimonSupport("void", "void_enemy_support", { requireType: "Ice" });
        const buff = digimonSupport("buff", "atk_buff", { value: 100, targetAttack: "all" });

        expect(canVoidEnemySupport(ice, gated.supportEffect, opp, true)).toBe(true);
        expect(canVoidEnemySupport(fire, gated.supportEffect, opp, true)).toBe(false);

        const ctx = createSupportBattleContext();
        resolveSupportPhase(fire, opp, gated, buff, ctx);
        expect(getEffectiveAttackDamage(opp, "circle", ctx)).toBe(500);
    });

    it("respects requireOpponentType on void (enemy specialty gate)", () => {
        const source = makePlayer("s", "Rare");
        const darkOpp = makePlayer("dark", "Dark");
        const fireOpp = makePlayer("fire", "Fire");
        const gated = digimonSupport("void", "void_enemy_support", { requireOpponentType: "Dark" });

        expect(canVoidEnemySupport(source, gated.supportEffect, darkOpp, true)).toBe(true);
        expect(canVoidEnemySupport(source, gated.supportEffect, fireOpp, true)).toBe(false);
        expect(canVoidEnemySupport(source, gated.supportEffect, darkOpp, false)).toBe(false);
    });
});
