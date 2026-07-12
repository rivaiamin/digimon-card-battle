import { describe, expect, it } from "vitest";
import {
    CONSENTED_LEAVE_CODE,
    RECONNECT_GRACE_SECONDS,
    isConsentedLeave,
    shouldForfeitOnPermanentLeave,
    shouldOfferReconnectGrace,
} from "./reconnectPolicy";

describe("reconnectPolicy (FC-024)", () => {
    it("uses a fixed grace window", () => {
        expect(RECONNECT_GRACE_SECONDS).toBe(30);
    });

    it("detects consented leave", () => {
        expect(isConsentedLeave(CONSENTED_LEAVE_CODE)).toBe(true);
        expect(isConsentedLeave(1006)).toBe(false);
        expect(isConsentedLeave(undefined)).toBe(false);
    });

    it("offers reconnect only for unexpected mid/pre-match drops", () => {
        expect(shouldOfferReconnectGrace("preparation", false)).toBe(true);
        expect(shouldOfferReconnectGrace("waiting", false)).toBe(true);
        expect(shouldOfferReconnectGrace("victory", false)).toBe(false);
        expect(shouldOfferReconnectGrace("preparation", true)).toBe(false);
    });

    it("forfeits only after match start on permanent leave", () => {
        expect(shouldForfeitOnPermanentLeave("battle_attack", 2)).toBe(true);
        expect(shouldForfeitOnPermanentLeave("draw", 2)).toBe(true);
        expect(shouldForfeitOnPermanentLeave("waiting", 2)).toBe(false);
        expect(shouldForfeitOnPermanentLeave("victory", 2)).toBe(false);
        expect(shouldForfeitOnPermanentLeave("preparation", 1)).toBe(false);
    });
});
