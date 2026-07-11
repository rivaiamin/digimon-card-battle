/**
 * Specialty Foe ×N attack modifiers (FC-016 / P3-3).
 * Manual: "Specialty x 3 — Triple your Attack Power against a certain Specialty."
 * Catalog text: "Ice Foe x3", "Fire Foe x3", "Darkness Foe x3", etc.
 *
 * Note: PS1 has no universal Circle/Triangle/Cross RPS damage triangle; GDD "RPS"
 * refers to predictive attack choice. Specialty Foe ×N is the per-card modifier.
 */

import { specialtiesMatch } from "./supportResolver";

const FOE_XN_RE = /^(Dark(?:ness)?|Fire|Ice|Nature|Rare)\s+Foe\s+x(\d+)\.?$/i;

export type SpecialtyFoeMult = {
    specialty: string;
    multiplier: number;
};

function canonicalizeSpecialtyLabel(raw: string): string {
    if (/^dark/i.test(raw)) return "Dark";
    const t = raw.trim();
    return t.charAt(0).toUpperCase() + t.slice(1).toLowerCase();
}

/** Parse catalog attack description into a Specialty Foe multiplier. */
export function parseSpecialtyFoeDescription(description: string): SpecialtyFoeMult | null {
    const m = String(description ?? "").trim().match(FOE_XN_RE);
    if (!m) return null;
    const multiplier = parseInt(m[2] ?? "0", 10);
    if (!Number.isFinite(multiplier) || multiplier <= 1) return null;
    return {
        specialty: canonicalizeSpecialtyLabel(m[1] ?? ""),
        multiplier,
    };
}

export function shouldApplySpecialtyFoeMult(
    foeSpecialty: string,
    opponentSpecialty: string
): boolean {
    if (!foeSpecialty.trim() || !opponentSpecialty.trim()) return false;
    return specialtiesMatch(foeSpecialty, opponentSpecialty);
}

export function applySpecialtyFoeMultiplier(
    damage: number,
    foeSpecialty: string,
    multiplier: number,
    opponentSpecialty: string
): number {
    if (damage <= 0) return damage;
    if (!shouldApplySpecialtyFoeMult(foeSpecialty, opponentSpecialty)) return damage;
    const m = multiplier > 0 ? multiplier : 3;
    return Math.floor(damage * m);
}
