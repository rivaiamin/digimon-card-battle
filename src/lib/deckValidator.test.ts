import { describe, expect, it } from "vitest";
import { resolveArenaVariant } from "./arenaVariant";
import { buildDefaultDeckCardIds } from "./defaultDeckBuilder";
import { validateDeck } from "./deckValidator";
import type { NormalizedCardCatalogEntry } from "./cardCatalogLoader";

function entry(
    id: string,
    overrides: Partial<NormalizedCardCatalogEntry> = {}
): NormalizedCardCatalogEntry {
    return {
        id,
        name: id,
        cardKind: "digimon",
        effectId: "",
        effectArgs: {},
        level: "Rookie",
        type: "Fire",
        hp: 100,
        maxHp: 100,
        plusDp: 0,
        evoCost: 0,
        image: "",
        attacks: {
            circle: { name: "c", damage: 10, type: "circle", description: "", effectId: "", effectArgs: {} },
            triangle: { name: "t", damage: 10, type: "triangle", description: "", effectId: "", effectArgs: {} },
            cross: { name: "x", damage: 10, type: "cross", description: "", effectId: "", effectArgs: {} },
        },
        supportEffect: null,
        ...overrides,
    };
}

function catalogMap(...cards: NormalizedCardCatalogEntry[]) {
    return new Map(cards.map(c => [c.id, c]));
}

function deck30(...ids: string[]): string[] {
    const out: string[] = [];
    while (out.length < 30) {
        for (const id of ids) {
            if (out.length >= 30) break;
            out.push(id);
        }
    }
    return out;
}

describe("validateDeck (FC-028)", () => {
    const rookie = entry("r1", { level: "Rookie" });
    const champ = entry("c1", { level: "Champion" });
    const option = entry("o1", { cardKind: "option", level: "" });
    const catalog = catalogMap(rookie, champ, option);
    const standard = resolveArenaVariant("standard");

    it("rejects wrong deck size", () => {
        const result = validateDeck(["r1"], catalog, standard);
        expect(result.ok).toBe(false);
        if (result.ok === false) expect(result.reason).toBe("deck_wrong_size");
    });

    it("rejects unknown card ids", () => {
        const ids = deck30("r1", "missing");
        const result = validateDeck(ids, catalog, standard);
        expect(result.ok).toBe(false);
        if (result.ok === false) expect(result.reason).toBe("unknown_card_id");
    });

    it("rejects too many copies", () => {
        const ids = Array(30).fill("r1");
        const result = validateDeck(ids, catalog, standard);
        expect(result.ok).toBe(false);
        if (result.ok === false) expect(result.reason).toBe("too_many_copies");
    });

    it("accepts a legal mixed deck", () => {
        const cards = [
            entry("r1", { level: "Rookie" }),
            entry("r2", { level: "Rookie" }),
            entry("r3", { level: "Rookie" }),
            entry("r4", { level: "Rookie" }),
            entry("r5", { level: "Rookie" }),
            entry("r6", { level: "Rookie" }),
            entry("r7", { level: "Rookie" }),
            entry("c1", { level: "Champion" }),
            entry("o1", { cardKind: "option", level: "" }),
        ];
        const fullCatalog = catalogMap(...cards);
        const ids = [
            ...Array(4).fill("r1"),
            ...Array(4).fill("r2"),
            ...Array(4).fill("r3"),
            ...Array(4).fill("c1"),
            "o1",
            ...Array(4).fill("r4"),
            ...Array(4).fill("r5"),
            ...Array(4).fill("r6"),
            "r7",
        ];
        expect(ids).toHaveLength(30);
        const result = validateDeck(ids, fullCatalog, standard);
        expect(result.ok).toBe(true);
    });

    it("rejects option cards in no_options arena (FC-029)", () => {
        const noOpt = resolveArenaVariant("no_options");
        const ids = deck30("r1", "o1");
        const result = validateDeck(ids, catalog, noOpt);
        expect(result.ok).toBe(false);
        if (result.ok === false) expect(result.reason).toBe("option_card_not_allowed");
    });
});

describe("buildDefaultDeckCardIds", () => {
    it("returns a legal deck from the full catalog", () => {
        const catalog = [
            entry("r1", { level: "Rookie" }),
            entry("r2", { level: "Rookie" }),
            entry("r3", { level: "Rookie" }),
            entry("r4", { level: "Rookie" }),
            entry("r5", { level: "Rookie" }),
            entry("r6", { level: "Rookie" }),
            entry("r7", { level: "Rookie" }),
            entry("r8", { level: "Rookie" }),
            entry("c1", { level: "Champion" }),
            entry("c2", { level: "Champion" }),
            entry("o1", { cardKind: "option", level: "" }),
        ];
        const ids = buildDefaultDeckCardIds(catalog, 0);
        expect(ids).toHaveLength(30);
        const result = validateDeck(ids, catalogMap(...catalog), resolveArenaVariant("standard"));
        expect(result.ok).toBe(true);
    });
});
