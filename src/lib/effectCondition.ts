/**
 * Conditional-effect gate engine (FC-027).
 *
 * Parses the "If <condition>, <effect>" head found on many Digimon support /
 * attack lines and evaluates it against a schema-free {@link ConditionContext}.
 * Kept free of Colyseus schema imports so it stays unit-testable in isolation;
 * callers build the context from PlayerSchema + the locked battle attacks.
 *
 * In `fidelity_ps1`, attacks lock BEFORE support resolves, so attack/HP/level/
 * specialty comparisons are all knowable when support effects apply. When an
 * attack is unknown (legacy simultaneous profile), attack-based conditions
 * degrade to `false` rather than firing incorrectly.
 *
 * @see docs/fidelity-rules-contract.md FC-027, RA-002
 */

import type { AttackType } from "./effectTextNormalize";
import { canonicalizeEffectText, letterToAttack, normalizeSpecialtyLabel } from "./effectTextNormalize";

/** One side of a battle comparison (the effect owner or their opponent). */
export interface ConditionSubject {
    attack: AttackType | null;
    hp: number;
    /** Rookie | Champion | Ultimate | Armor (raw catalog label). */
    level: string;
    /** Fire | Ice | Nature | Dark | Rare (raw catalog label). */
    specialty: string;
    handCount: number;
}

export interface ConditionContext {
    self: ConditionSubject;
    opponent: ConditionSubject;
}

export type EffectCondition =
    | { kind: "attacks_same" }
    | { kind: "attacks_different" }
    | { kind: "own_attack_is"; attack: AttackType }
    | { kind: "own_attack_not"; attack: AttackType }
    | { kind: "opponent_used"; attack: AttackType }
    | { kind: "own_hp_lt"; value: number }
    | { kind: "own_hp_lt_opponent" }
    | { kind: "own_hp_gt_opponent" }
    | { kind: "opponent_hp_gt"; value: number }
    | { kind: "opponent_hp_lt_own" }
    | { kind: "own_level_is"; level: string }
    | { kind: "opponent_level_is"; level: string }
    | { kind: "both_levels_are"; level: string }
    | { kind: "own_level_lower" }
    | { kind: "own_specialty_is"; specialty: string }
    | { kind: "opponent_specialty_is"; specialty: string }
    | { kind: "opponent_specialty_not"; specialty: string }
    | { kind: "opponent_specialty_in"; specialties: string[] }
    | { kind: "specialties_same" }
    | { kind: "own_hand_gte"; value: number }
    | { kind: "own_hand_lte"; value: number };

/** Rank levels for lower/higher comparisons. Armor sits at Champion tier (DCB). */
const LEVEL_RANK: Record<string, number> = {
    rookie: 1,
    r: 1,
    champion: 2,
    c: 2,
    armor: 2,
    a: 2,
    ultimate: 3,
    u: 3,
    mega: 4,
    m: 4,
};

/** Normalize a level label/letter to a canonical letter (R/C/U/A/M). */
export function normalizeLevelLetter(raw: string): string {
    const t = String(raw).trim().toLowerCase();
    if (t.startsWith("rookie") || t === "r") return "R";
    if (t.startsWith("champion") || t === "c") return "C";
    if (t.startsWith("ultimate") || t === "u") return "U";
    if (t.startsWith("armor") || t === "a") return "A";
    if (t.startsWith("mega") || t === "m") return "M";
    return raw.trim().toUpperCase().slice(0, 1);
}

function levelRank(level: string): number {
    return LEVEL_RANK[String(level).trim().toLowerCase()] ?? 0;
}

function specialtyEq(a: string, b: string): boolean {
    return normalizeSpecialtyLabel(a).toLowerCase() === normalizeSpecialtyLabel(b).toLowerCase();
}

export function evaluateCondition(cond: EffectCondition, ctx: ConditionContext): boolean {
    const { self, opponent } = ctx;
    switch (cond.kind) {
        case "attacks_same":
            return self.attack != null && opponent.attack != null && self.attack === opponent.attack;
        case "attacks_different":
            return self.attack != null && opponent.attack != null && self.attack !== opponent.attack;
        case "own_attack_is":
            return self.attack === cond.attack;
        case "own_attack_not":
            return self.attack != null && self.attack !== cond.attack;
        case "opponent_used":
            return opponent.attack === cond.attack;
        case "own_hp_lt":
            return self.hp < cond.value;
        case "own_hp_lt_opponent":
            return self.hp < opponent.hp;
        case "own_hp_gt_opponent":
            return self.hp > opponent.hp;
        case "opponent_hp_gt":
            return opponent.hp > cond.value;
        case "opponent_hp_lt_own":
            return opponent.hp < self.hp;
        case "own_level_is":
            return normalizeLevelLetter(self.level) === normalizeLevelLetter(cond.level);
        case "opponent_level_is":
            return normalizeLevelLetter(opponent.level) === normalizeLevelLetter(cond.level);
        case "both_levels_are": {
            const want = normalizeLevelLetter(cond.level);
            return (
                normalizeLevelLetter(self.level) === want &&
                normalizeLevelLetter(opponent.level) === want
            );
        }
        case "own_level_lower": {
            const a = levelRank(self.level);
            const b = levelRank(opponent.level);
            return a > 0 && b > 0 && a < b;
        }
        case "own_specialty_is":
            return specialtyEq(self.specialty, cond.specialty);
        case "opponent_specialty_is":
            return specialtyEq(opponent.specialty, cond.specialty);
        case "opponent_specialty_not":
            return !specialtyEq(opponent.specialty, cond.specialty);
        case "opponent_specialty_in":
            return cond.specialties.some(s => specialtyEq(opponent.specialty, s));
        case "specialties_same":
            return specialtyEq(self.specialty, opponent.specialty);
        case "own_hand_gte":
            return self.handCount >= cond.value;
        case "own_hand_lte":
            return self.handCount <= cond.value;
        default:
            return false;
    }
}

const SPECIALTY_WORD = "(Fire|Ice|Nature|Dark(?:ness)?|Rare)";

/**
 * Parse the condition clause (the text between "If" and the comma).
 * Returns null when the clause is not a recognized gate.
 */
export function parseCondition(rawHead: string): EffectCondition | null {
    const text = canonicalizeEffectText(rawHead).replace(/^if\s+/i, "").trim();
    if (!text) return null;

    // --- Attack comparisons ---
    if (/^both\s+attacks?\s+are\s+different$/i.test(text)) return { kind: "attacks_different" };
    if (/^both\s+attacks?\s+are\s+same$/i.test(text)) return { kind: "attacks_same" };
    if (/^both\s+players\s+use\s+same\s+attack$/i.test(text)) return { kind: "attacks_same" };

    let m = text.match(/^own\s+attack\s+is\s+not\s+(circle|triangle|cross)$/i);
    if (m) return { kind: "own_attack_not", attack: letterToAttack(m[1])! };
    m = text.match(/^own\s+attack\s+is\s+(circle|triangle|cross)$/i);
    if (m) return { kind: "own_attack_is", attack: letterToAttack(m[1])! };
    m = text.match(/^opponent\s+(?:used|uses)\s+(circle|triangle|cross)$/i);
    if (m) return { kind: "opponent_used", attack: letterToAttack(m[1])! };

    // --- HP comparisons ---
    m = text.match(/^own\s+hp\s+(?:are|is)\s+less\s+th[ae]n\s+(\d+)$/i);
    if (m) return { kind: "own_hp_lt", value: Number(m[1]) };
    if (/^own\s+hp\s+(?:are|is)\s+less\s+th[ae]n\s+(?:foe'?s|opponent'?s)\s+hp$/i.test(text)) {
        return { kind: "own_hp_lt_opponent" };
    }
    if (/^own\s+hp\s+(?:are|is)\s+more\s+th[ae]n\s+opponent'?s\s+hp$/i.test(text)) {
        return { kind: "own_hp_gt_opponent" };
    }
    if (/^opponent'?s\s+hp\s+(?:are|is)\s+lower\s+th[ae]n\s+own$/i.test(text)) {
        return { kind: "opponent_hp_lt_own" };
    }
    if (/^opponent'?s\s+hp\s+(?:are|is)\s+less\s+th[ae]n\s+own$/i.test(text)) {
        return { kind: "opponent_hp_lt_own" };
    }
    m = text.match(/^opponent'?s\s+hp\s+(?:are|is)\s+more\s+th[ae]n\s+(\d+)\+?$/i);
    if (m) return { kind: "opponent_hp_gt", value: Number(m[1]) };
    m = text.match(/^opponent'?s\s+hp\s+(?:are|is)\s+(\d+)\+$/i);
    if (m) return { kind: "opponent_hp_gt", value: Number(m[1]) - 1 };

    // --- Level comparisons ---
    m = text.match(/^both\s+levels?\s+are\s+([rcuam])$/i);
    if (m) return { kind: "both_levels_are", level: m[1] };
    m = text.match(/^own\s+level\s+is\s+([rcuam])$/i);
    if (m) return { kind: "own_level_is", level: m[1] };
    m = text.match(/^opponent\s+is\s+level\s+([rcuam])$/i);
    if (m) return { kind: "opponent_level_is", level: m[1] };
    m = text.match(/^opponent'?s\s+level\s+is\s+([rcuam])$/i);
    if (m) return { kind: "opponent_level_is", level: m[1] };
    if (/^own\s+level\s+is\s+(?:lower|below\s+opponent'?s)$/i.test(text)) {
        return { kind: "own_level_lower" };
    }

    // --- Specialty comparisons ---
    m = text.match(
        new RegExp(
            `^(?:opponent'?s|foe'?s)\\s+specialty\\s+is\\s+${SPECIALTY_WORD}\\s+or\\s+${SPECIALTY_WORD}$`,
            "i"
        )
    );
    if (m) return { kind: "opponent_specialty_in", specialties: [m[1]!, m[2]!] };
    m = text.match(new RegExp(`^(?:opponent'?s|foe'?s)\\s+specialty\\s+is\\s+not\\s+${SPECIALTY_WORD}$`, "i"));
    if (m) return { kind: "opponent_specialty_not", specialty: m[1]! };
    m = text.match(new RegExp(`^(?:opponent'?s|foe'?s)\\s+specialty\\s+is\\s+${SPECIALTY_WORD}$`, "i"));
    if (m) return { kind: "opponent_specialty_is", specialty: m[1]! };
    m = text.match(new RegExp(`^own\\s+specialty\\s+is\\s+${SPECIALTY_WORD}$`, "i"));
    if (m) return { kind: "own_specialty_is", specialty: m[1]! };
    if (/^specialties\s+are\s+same$/i.test(text)) return { kind: "specialties_same" };

    // --- Hand-count comparisons ---
    m = text.match(/^own\s+cards?\s+in\s+hand\s+(\d+)\s+or\s+more$/i);
    if (m) return { kind: "own_hand_gte", value: Number(m[1]) };
    m = text.match(/^(\d+)\s+or\s+less\s+cards?\s+left\s+in\s+own\s+hand$/i);
    if (m) return { kind: "own_hand_lte", value: Number(m[1]) };
    m = text.match(/^own\s+cards?\s+in\s+hand\s+(\d+)\s+or\s+less$/i);
    if (m) return { kind: "own_hand_lte", value: Number(m[1]) };

    return null;
}

/** Split an "If <head>, <consequent>" line. Returns null when there is no gate. */
export function splitConditional(text: string): { head: string; consequent: string } | null {
    const t = text.trim();
    if (!/^if\s+/i.test(t)) return null;
    const comma = t.indexOf(",");
    if (comma === -1) return null;
    const head = t.slice(0, comma);
    const consequent = t.slice(comma + 1).trim();
    if (!consequent) return null;
    return { head: head.replace(/^if\s+/i, "").trim(), consequent };
}
