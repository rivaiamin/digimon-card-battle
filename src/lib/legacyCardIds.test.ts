import { describe, expect, it } from "vitest";
import { migrateDeckCardIds, resolveCatalogCardId } from "./legacyCardIds";

describe("legacyCardIds", () => {
    it("maps synthetic option and slug ids to official catalog ids", () => {
        expect(resolveCatalogCardId("agumon")).toBe("027");
        expect(resolveCatalogCardId("evo_opt_warp")).toBe("297");
        expect(resolveCatalogCardId("301")).toBe("172");
        expect(resolveCatalogCardId("opt_battle_spike")).toBe("264");
    });

    it("leaves official catalog ids unchanged", () => {
        expect(resolveCatalogCardId("027")).toBe("027");
        expect(resolveCatalogCardId("001")).toBe("001"); // Omnimon I — not legacy Agumon
    });

    it("migrates a full deck list", () => {
        expect(migrateDeckCardIds(["agumon", "027", "evo_opt_warp"])).toEqual([
            "027",
            "027",
            "297",
        ]);
    });
});
