import { describe, expect, it } from "vitest";
import {
    applyOpeningPenalty,
    drawToTarget,
    hasLegalDeployInHand,
    isDigimonCard,
    mulliganHand,
    resolveInitialPrepSubPhase,
    shouldDeckOutOnDraw,
    validateDeployDigimon,
} from "./openingFlow";
import { getRuleProfile } from "./ruleProfile";

function makeCard(level: string, overrides: Partial<ReturnType<typeof baseCard>> = {}) {
    return { ...baseCard(level), ...overrides };
}

function baseCard(level: string) {
    return {
        id: `card_${level}`,
        level,
        cardKind: "digimon",
        hp: 1000,
        maxHp: 1000,
        circle: { damage: 400 },
        triangle: { damage: 300 },
        cross: { damage: 200 },
    };
}

describe("drawToTarget (FC-001)", () => {
    it("draws to 4 for fidelity profile hand target", () => {
        const hand: ReturnType<typeof baseCard>[] = [];
        const deck = [makeCard("Rookie"), makeCard("Rookie"), makeCard("Champion"), makeCard("Ultimate"), makeCard("Rookie")];
        const result = drawToTarget(hand, deck, 4);
        expect(result.drawn).toBe(4);
        expect(hand).toHaveLength(4);
        expect(deck).toHaveLength(1);
    });

    it("does not overdraw when hand already at target", () => {
        const hand = [makeCard("Rookie"), makeCard("Rookie"), makeCard("Rookie"), makeCard("Rookie")];
        const deck = [makeCard("Champion")];
        const result = drawToTarget(hand, deck, 4);
        expect(result.drawn).toBe(0);
        expect(hand).toHaveLength(4);
    });
});

describe("mulligan (FC-001)", () => {
    it("returns hand to deck and redraws to target", () => {
        const hand = [makeCard("Rookie"), makeCard("Rookie")];
        const deck = [makeCard("Champion"), makeCard("Ultimate"), makeCard("Rookie"), makeCard("Rookie")];
        const identityShuffle = <T,>(_arr: T[]) => {};
        const result = mulliganHand(hand, deck, 4, identityShuffle);
        expect(hand).toHaveLength(4);
        expect(result.handSize).toBe(4);
        expect(deck).toHaveLength(2);
    });
});

describe("opening deploy penalties (FC-002)", () => {
    const profile = getRuleProfile("fidelity_ps1");

    it("halves Champion HP and attacks", () => {
        const card = makeCard("Champion");
        const { applied, multiplier } = applyOpeningPenalty(card, profile);
        expect(applied).toBe(true);
        expect(multiplier?.hp).toBe(0.5);
        expect(card.maxHp).toBe(500);
        expect(card.circle.damage).toBe(200);
    });

    it("quarters Ultimate HP and attacks", () => {
        const card = makeCard("Ultimate", { maxHp: 1200, hp: 1200, circle: { damage: 800 } });
        const { applied } = applyOpeningPenalty(card, profile);
        expect(applied).toBe(true);
        expect(card.maxHp).toBe(300);
        expect(card.circle.damage).toBe(200);
    });

    it("allows Champion/Ultimate on opening deploy only", () => {
        const champion = makeCard("Champion");
        const opening = validateDeployDigimon(champion, profile, true);
        expect(opening.ok).toBe(true);
        if (opening.ok) expect(opening.penaltyLevel).toBe("champion");

        const postKo = validateDeployDigimon(champion, profile, false);
        expect(postKo.ok).toBe(false);
        if (postKo.ok === false) {
            expect(postKo.reason).toBe("post_ko_rookie_only");
        }
    });
});

describe("prep sub-phase resolution (FC-003)", () => {
    const profile = getRuleProfile("fidelity_ps1");

    it("starts with mulligan when opening and redraws remain", () => {
        expect(resolveInitialPrepSubPhase(false, true, 1, profile)).toBe("mulligan");
    });

    it("skips mulligan when no redraws left", () => {
        expect(resolveInitialPrepSubPhase(false, true, 0, profile)).toBe("deploy");
    });

    it("goes to discard when active digimon exists", () => {
        expect(resolveInitialPrepSubPhase(true, false, 0, profile)).toBe("discard");
    });
});

describe("deck-out on draw (FC-005)", () => {
    it("triggers when active player cannot reach hand target", () => {
        expect(shouldDeckOutOnDraw(true, 2, 0, 4)).toBe(true);
        expect(shouldDeckOutOnDraw(true, 4, 0, 4)).toBe(false);
        expect(shouldDeckOutOnDraw(false, 0, 0, 4)).toBe(false);
    });
});

describe("post-KO deploy helpers (FC-003)", () => {
    const profile = getRuleProfile("fidelity_ps1");

    it("treats empty cardKind as digimon", () => {
        expect(isDigimonCard({ ...baseCard("Rookie"), cardKind: "" })).toBe(true);
    });

    it("detects legal post-KO rookie deploy in hand", () => {
        const hand = [makeCard("Champion"), makeCard("Rookie")];
        expect(hasLegalDeployInHand(hand, profile, false)).toBe(true);
        expect(hasLegalDeployInHand([makeCard("Champion")], profile, false)).toBe(false);
    });
});
