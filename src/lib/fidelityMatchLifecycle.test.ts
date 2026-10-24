import { describe, expect, it } from "vitest";
import cardsData from "../data/cards.json";
import { loadCardCatalog } from "./cardCatalogLoader";
import { resolveArenaVariant } from "./arenaVariant";
import { getRuleProfile } from "./ruleProfile";
import {
    matchEndVictoryMessage,
    pickFirstActiveSessionId,
    resolveJoinDeckCardIds,
    validateClientJoin,
} from "./fidelityMatchLifecycle";

const catalog = loadCardCatalog(cardsData);

describe("fidelityMatchLifecycle", () => {
    it("rejects join when rule profile or arena does not match room", () => {
        const roomProfile = getRuleProfile("fidelity_ps1");
        const roomArena = resolveArenaVariant("standard");

        expect(validateClientJoin(roomProfile, roomArena, "legacy_online", "standard")).toEqual({
            ok: false,
            code: "rule_profile_mismatch",
        });
        expect(validateClientJoin(roomProfile, roomArena, "fidelity_ps1", "no_options")).toEqual({
            ok: false,
            code: "arena_variant_mismatch",
        });
        expect(validateClientJoin(roomProfile, roomArena, "fidelity_ps1", "standard")).toEqual({
            ok: true,
        });
    });

    it("resolves join deck ids from payload or default deck for seat index", () => {
        const fromDefault = resolveJoinDeckCardIds(undefined, 0, catalog);
        expect(fromDefault.length).toBe(30);
        const migrated = resolveJoinDeckCardIds(["agumon", "027"], 0, catalog);
        expect(migrated).toContain("027");
    });

    it("picks first active player with a fair coin flip", () => {
        expect(pickFirstActiveSessionId(["a", "b"], () => 0)).toBe("a");
        expect(pickFirstActiveSessionId(["a", "b"], () => 0.5)).toBe("b");
    });

    it("maps match end reasons to victory messages", () => {
        expect(matchEndVictoryMessage("disconnect")).toBe("A player disconnected.");
        expect(matchEndVictoryMessage("points")).toBe("Match Over");
    });
});
