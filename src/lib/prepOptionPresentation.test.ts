import { describe, expect, it } from "vitest";
import { formatPrepOptionFeedback, getPrepOptionBadge } from "./prepOptionPresentation";

describe("prepOptionPresentation (P2-4)", () => {
    it("maps effect ids to hand badges", () => {
        expect(getPrepOptionBadge({ effectId: "option.prep.gain_dp", effectArgs: { value: 20 } })).toBe(
            "+20 DP"
        );
        expect(getPrepOptionBadge({ effectId: "option.prep.draw", effectArgs: { count: 2 } })).toBe(
            "DRAW 2"
        );
        expect(getPrepOptionBadge({ effectId: "option.prep.heal_active", effectArgs: { value: 300 } })).toBe(
            "HEAL 300"
        );
        expect(getPrepOptionBadge({ effectId: "option.prep.fetch_trash_digimon" })).toBe("FETCH");
    });

    it("formats post-play feedback from observed deltas", () => {
        expect(
            formatPrepOptionFeedback(
                { effectId: "option.prep.gain_dp", effectArgs: { value: 20 } },
                { dpGain: 20 }
            )
        ).toBe("+20 DP");
        expect(
            formatPrepOptionFeedback(
                { effectId: "option.prep.draw", effectArgs: { count: 1 } },
                { cardsDrawn: 1 }
            )
        ).toBe("Drew 1 card");
        expect(
            formatPrepOptionFeedback(
                { effectId: "option.prep.heal_active", effectArgs: { value: 250 } },
                { hpGain: 250 }
            )
        ).toBe("+250 HP");
        expect(
            formatPrepOptionFeedback({ effectId: "option.prep.fetch_trash_digimon" }, {})
        ).toBe("Digimon fetched");
    });
});
