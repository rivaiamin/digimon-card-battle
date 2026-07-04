import { describe, expect, it } from "vitest";
import {
    canLockSupport,
    getDefenderSessionId,
    initialSupportPicker,
    nextSupportPickerAfterLock,
} from "./supportPhase";

const SESSIONS = ["active_sess", "defender_sess"] as const;
const ACTIVE = SESSIONS[0];
const DEFENDER = SESSIONS[1];

describe("getDefenderSessionId (FC-012)", () => {
    it("returns the non-active session", () => {
        expect(getDefenderSessionId(ACTIVE, SESSIONS)).toBe(DEFENDER);
        expect(getDefenderSessionId(DEFENDER, SESSIONS)).toBe(ACTIVE);
    });
});

describe("sequential support pick order (FC-012 / RA-003)", () => {
    it("starts with defender", () => {
        expect(initialSupportPicker(DEFENDER)).toBe(DEFENDER);
    });

    it("allows only the designated picker", () => {
        expect(canLockSupport(DEFENDER, DEFENDER, true, false)).toBe(true);
        expect(canLockSupport(ACTIVE, DEFENDER, true, false)).toBe(false);
        expect(canLockSupport(ACTIVE, "", true, false)).toBe(false);
    });

    it("advances to active after defender locks", () => {
        expect(nextSupportPickerAfterLock(DEFENDER, DEFENDER, ACTIVE)).toBe(ACTIVE);
        expect(canLockSupport(ACTIVE, ACTIVE, true, false)).toBe(true);
    });

    it("clears picker after active locks", () => {
        expect(nextSupportPickerAfterLock(ACTIVE, DEFENDER, ACTIVE)).toBe("");
    });

    it("rejects duplicate locks", () => {
        expect(canLockSupport(DEFENDER, DEFENDER, true, true)).toBe(false);
    });
});

describe("simultaneous support (legacy_online)", () => {
    it("allows either player to lock when sequential is off", () => {
        expect(canLockSupport(DEFENDER, "", false, false)).toBe(true);
        expect(canLockSupport(ACTIVE, "", false, false)).toBe(true);
    });
});
