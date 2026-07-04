/**
 * Pure opening / preparation helpers (testable without Colyseus).
 * @see docs/fidelity-rules-contract.md FC-001, FC-002, FC-006
 */

import type { RuleProfile, StatMultiplier } from "./ruleProfile";

export type PrepSubPhase = "" | "mulligan" | "deploy" | "discard" | "evolve";

export type DigimonLevel = "Rookie" | "Champion" | "Ultimate" | "Mega" | "Armor";

export interface MinimalCard {
    id: string;
    level: string;
    cardKind?: string;
    hp: number;
    maxHp: number;
    circle: { damage: number };
    triangle: { damage: number };
    cross: { damage: number };
}

export interface DrawResult {
    drawn: number;
    handSize: number;
    deckSize: number;
}

/** Minimal mutable array contract (works with Colyseus ArraySchema). */
export interface MutableCardList<T> {
    readonly length: number;
    push(...items: T[]): number;
    shift(): T | undefined;
    splice(start: number, deleteCount?: number, ...items: T[]): T[];
    some(predicate: (item: T) => boolean): boolean;
    [index: number]: T;
}

export function normalizeLevel(level: string): string {
    return String(level).trim().toLowerCase();
}

export function isRookieLevel(level: string): boolean {
    return normalizeLevel(level) === "rookie";
}

export function isDigimonCard(card: MinimalCard): boolean {
    const kind = card.cardKind ?? "digimon";
    return kind === "digimon";
}

export function hasDigimonInHand(hand: { some(predicate: (c: MinimalCard) => boolean): boolean }): boolean {
    return hand.some(c => isDigimonCard(c));
}

export function hasRookieInHand(hand: { some(predicate: (c: MinimalCard) => boolean): boolean }): boolean {
    return hand.some(c => isDigimonCard(c) && isRookieLevel(c.level));
}

/** Draw from deck into hand until `hand.length >= target` or deck is empty. */
export function drawToTarget<T extends MinimalCard>(
    hand: MutableCardList<T>,
    deck: MutableCardList<T>,
    target: number
): DrawResult {
    const needed = Math.max(0, target - hand.length);
    let drawn = 0;
    for (let i = 0; i < needed; i++) {
        if (deck.length <= 0) break;
        hand.push(deck.shift()!);
        drawn++;
    }
    return { drawn, handSize: hand.length, deckSize: deck.length };
}

/** Shuffle hand back into deck, then draw to target. */
export function mulliganHand<T extends MinimalCard>(
    hand: MutableCardList<T>,
    deck: MutableCardList<T>,
    target: number,
    shuffle: <U>(arr: U[]) => void
): DrawResult {
    while (hand.length > 0) {
        deck.push(hand.shift()!);
    }
    shuffle(deck as T[]);
    return drawToTarget(hand, deck, target);
}

export function getOpeningPenaltyMultiplier(
    level: string,
    profile: RuleProfile
): StatMultiplier | null {
    const lvl = normalizeLevel(level);
    if (lvl === "champion" && profile.openingDeploy.allowChampion) {
        return profile.openingDeploy.penalties.champion;
    }
    if (lvl === "ultimate" && profile.openingDeploy.allowUltimate) {
        return profile.openingDeploy.penalties.ultimate;
    }
    return null;
}

/** Apply PS1 opening penalties in-place on a deployed card copy. */
export function applyOpeningPenalty<T extends MinimalCard>(
    card: T,
    profile: RuleProfile
): { applied: boolean; multiplier: StatMultiplier | null } {
    const mult = getOpeningPenaltyMultiplier(card.level, profile);
    if (!mult) return { applied: false, multiplier: null };

    card.maxHp = Math.max(1, Math.floor(card.maxHp * mult.hp));
    card.hp = card.maxHp;
    card.circle.damage = Math.max(0, Math.floor(card.circle.damage * mult.atk));
    card.triangle.damage = Math.max(0, Math.floor(card.triangle.damage * mult.atk));
    card.cross.damage = Math.max(0, Math.floor(card.cross.damage * mult.atk));

    return { applied: true, multiplier: mult };
}

export type DeployValidation =
    | { ok: true; isOpening: boolean; penaltyLevel: string | null }
    | { ok: false; reason: string };

export function validateDeployDigimon(
    card: MinimalCard,
    profile: RuleProfile,
    isOpeningDeploy: boolean
): DeployValidation {
    if (!isDigimonCard(card)) {
        return { ok: false, reason: "not_digimon" };
    }

    const lvl = normalizeLevel(card.level);

    if (isOpeningDeploy) {
        if (isRookieLevel(card.level)) {
            return { ok: true, isOpening: true, penaltyLevel: null };
        }
        if (lvl === "champion" && profile.openingDeploy.allowChampion) {
            return { ok: true, isOpening: true, penaltyLevel: "champion" };
        }
        if (lvl === "ultimate" && profile.openingDeploy.allowUltimate) {
            return { ok: true, isOpening: true, penaltyLevel: "ultimate" };
        }
        return { ok: false, reason: "opening_level_not_allowed" };
    }

    if (profile.postKoDeployRookieOnly && !isRookieLevel(card.level)) {
        return { ok: false, reason: "post_ko_rookie_only" };
    }

    return { ok: true, isOpening: false, penaltyLevel: null };
}

export function resolveInitialPrepSubPhase(
    hasActive: boolean,
    needsOpeningDeploy: boolean,
    mulligansRemaining: number,
    profile: RuleProfile
): PrepSubPhase {
    if (hasActive) return "discard";
    if (needsOpeningDeploy && profile.mulligan.enabled && mulligansRemaining > 0) {
        return "mulligan";
    }
    return "deploy";
}

export function isHandBelowTarget(handSize: number, target: number): boolean {
    return handSize < target;
}

export function shouldDeckOutOnDraw(
    hasActive: boolean,
    handSize: number,
    deckSize: number,
    target: number
): boolean {
    return hasActive && isHandBelowTarget(handSize, target) && deckSize <= 0;
}
