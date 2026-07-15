/**
 * Normalize catalog effect text → runtime effectId + args (FC-026 / FC-027).
 * Shared by card catalog load and effects.json builder.
 */

import type { EffectArgs } from "../types";
import { parseCondition, splitConditional } from "./effectCondition";

export type AttackType = "circle" | "triangle" | "cross";

export function letterToAttack(letter: string | undefined): AttackType | null {
    if (!letter) return null;
    const l = letter.toLowerCase();
    if (l === "o" || l === "c" || l === "circle") return "circle";
    if (l === "t" || l === "triangle") return "triangle";
    if (l === "x" || l === "cross") return "cross";
    return null;
}

export function normalizeSpecialtyLabel(raw: string): string {
    const t = raw.trim().toLowerCase();
    if (t === "darkness" || t === "dark") return "Dark";
    if (t === "fire") return "Fire";
    if (t === "ice") return "Ice";
    if (t === "nature") return "Nature";
    if (t === "rare") return "Rare";
    return raw.trim();
}

/**
 * Canonicalize catalog phrasing so one set of rules covers the source's synonyms:
 * possessive pronouns / "foe" → "opponent's", "Atk Pwr" → "Attack Power", and
 * a couple of source-data typos. Applied before parsing conditions/effects.
 */
export function canonicalizeEffectText(raw: string): string {
    return String(raw)
        .replace(/\bAtk\s*\.?\s*(?:Pwr|Power)\b/gi, "Attack Power")
        .replace(/\bAttack\s*Pwr\b/gi, "Attack Power")
        .replace(/\bmumber\b/gi, "number")
        .replace(/\brecovcer\b/gi, "recover")
        .replace(/\bhis\b/gi, "opponent's")
        .replace(/\bher\b/gi, "opponent's")
        .replace(/\bfoe'?s\b/gi, "opponent's")
        .replace(/\bfoe\b/gi, "opponent")
        .replace(/\s+/g, " ")
        .trim();
}

/** Cross / attack descriptions like "1st Attack", "Jamming", "Ice Foe x3". */
export function parseAttackEffectFromDescription(
    description: string
): { effectId: string; effectArgs: EffectArgs } | null {
    const text = description.trim();
    if (!text) return null;

    if (/^1st\s*attack\.?$/i.test(text)) {
        return { effectId: "attack.first_strike", effectArgs: {} };
    }
    if (/^jamming\.?$/i.test(text)) {
        return { effectId: "attack.jamming", effectArgs: {} };
    }

    const foe = text.match(/^(Dark(?:ness)?|Fire|Ice|Nature|Rare)\s+Foe\s+x(\d+)\.?$/i);
    if (foe) {
        const multiplier = parseInt(foe[2] ?? "0", 10);
        if (!Number.isFinite(multiplier) || multiplier <= 1) return null;
        const specialty = normalizeSpecialtyLabel(String(foe[1] ?? ""));
        return {
            effectId: "attack.specialty_mult",
            effectArgs: { specialty, multiplier },
        };
    }

    return null;
}

export type InferredSupportEffect = {
    type: string;
    targetAttack?: string;
    value?: number;
    description: string;
};

/** Split multi-clause support text without breaking quoted fragments. */
export function splitEffectClauses(text: string): string[] {
    const clauses: string[] = [];
    let buf = "";
    let inQuote = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i]!;
        if (ch === '"' || ch === "“" || ch === "”") {
            // Closing quote after an interior period ends the clause
            // (e.g. Own attack becomes "Eat-up HP.")
            if (inQuote && buf.trimEnd().endsWith(".")) {
                const trimmed = buf.trim().replace(/\.$/, "");
                if (trimmed) clauses.push(trimmed);
                buf = "";
                inQuote = false;
                continue;
            }
            inQuote = !inQuote;
            buf += ch;
            continue;
        }
        if (ch === "." && !inQuote) {
            const trimmed = buf.trim();
            if (trimmed) clauses.push(trimmed);
            buf = "";
            continue;
        }
        buf += ch;
    }
    const tail = buf.trim().replace(/\.$/, "");
    if (tail) clauses.push(tail);
    return clauses;
}

/**
 * Promote exact-match catalog_text support lines to mechanical types.
 * Also used as a single-clause parser inside compound effects.
 */
export function inferSupportEffectFromDescription(
    description: string
): InferredSupportEffect | null {
    // Strip quotes BEFORE the trailing period, else `Eat-up HP."` keeps its dot.
    const text = canonicalizeEffectText(description)
        .replace(/["“”]/g, "")
        .replace(/\.\s*$/, "")
        .replace(/^(?:then|and)\s+/i, "") // leading connector left by clause splitting
        .trim();
    if (!text || /^none$/i.test(text)) return null;

    if (/^opponent'?s support effect is voided$/i.test(text)) {
        return { type: "void_enemy_support", description: text };
    }
    if (/^attack first$/i.test(text)) {
        return { type: "first_strike", description: text };
    }

    const forceAtk = text.match(/^opponent uses ([otx]|circle|triangle|cross)$/i);
    if (forceAtk) {
        return {
            type: "change_attack",
            targetAttack: letterToAttack(forceAtk[1]) ?? undefined,
            description: text,
        };
    }
    const useOwn = text.match(/^use (circle|triangle|cross)$/i);
    if (useOwn) {
        return { type: "force_self_attack", targetAttack: letterToAttack(useOwn[1])!, description: text };
    }

    const bothForce = text.match(/^both players(?:' attacks)?(?: become| use) (circle|triangle|cross)$/i);
    if (bothForce) {
        return {
            type: "both_change_attack",
            targetAttack: letterToAttack(bothForce[1]) ?? undefined,
            description: text,
        };
    }

    const buffO = text.match(/^boost own circle attack power (?:by )?\+?(\d+)$/i);
    if (buffO) {
        return {
            type: "atk_buff",
            targetAttack: "circle",
            value: Number(buffO[1]),
            description: text,
        };
    }
    const buffT = text.match(/^boost own triangle attack power (?:by )?\+?(\d+)$/i);
    if (buffT) {
        return {
            type: "atk_buff",
            targetAttack: "triangle",
            value: Number(buffT[1]),
            description: text,
        };
    }
    const buffX = text.match(/^boost own cross attack power (?:by )?\+?(\d+)$/i);
    if (buffX) {
        return {
            type: "atk_buff",
            targetAttack: "cross",
            value: Number(buffX[1]),
            description: text,
        };
    }
    const buffAll = text.match(/^boost own attack power (?:by )?\+?(\d+)$/i);
    if (buffAll) {
        return {
            type: "atk_buff",
            targetAttack: "all",
            value: Number(buffAll[1]),
            description: text,
        };
    }
    const buffBare = text.match(/^boost attack power (?:by )?\+?(\d+)$/i);
    if (buffBare) {
        return {
            type: "atk_buff",
            targetAttack: "all",
            value: Number(buffBare[1]),
            description: text,
        };
    }

    const bothBuff = text.match(/^both players boost attack power \+?(\d+)$/i);
    if (bothBuff) {
        return {
            type: "both_atk_buff",
            targetAttack: "all",
            value: Number(bothBuff[1]),
            description: text,
        };
    }

    const heal = text.match(/^recover own hp (?:by )?\+?(\d+)$/i);
    if (heal) {
        return { type: "hp_heal", value: Number(heal[1]), description: text };
    }

    if (/^opponent'?s hp are halved$/i.test(text)) {
        return { type: "halve_hp", description: text };
    }
    if (/^own hp are halved$/i.test(text)) {
        return { type: "self_halve_hp", description: text };
    }
    if (/^both players'? hp are halved$/i.test(text)) {
        return { type: "both_halve_hp", description: text };
    }
    if (/^both players'? attack power becomes 0$/i.test(text)) {
        return { type: "both_atk_zero", description: text };
    }

    const ownSpecialty = text.match(/^changes? own specialty to (fire|ice|nature|darkness|dark|rare)$/i);
    if (ownSpecialty) {
        return {
            type: "change_own_specialty",
            targetAttack: normalizeSpecialtyLabel(ownSpecialty[1] ?? ""),
            description: text,
        };
    }

    const handAtk = text.match(/^add number of cards in hand x(\d+) to own attack power$/i);
    if (handAtk) {
        return {
            type: "hand_x_atk",
            targetAttack: "all",
            value: Number(handAtk[1]),
            description: text,
        };
    }

    if (/^own attack (?:becomes|is)\s*eat-up hp$/i.test(text)) {
        return { type: "grant_eat_up_hp", description: text };
    }

    if (/^circle & triangle attack power are 0$/i.test(text)) {
        return { type: "zero_attacks", targetAttack: "circle,triangle", description: text };
    }

    const draw = text.match(/^draw (\d+) cards?(?: from(?: own)? online deck)?$/i);
    if (draw) {
        return { type: "draw_cards", value: Number(draw[1]), description: text };
    }

    // --- Attack power: multiply (own) ---
    const dblAtkSlot = text.match(/^own (circle|triangle|cross) attack power is doubled$/i);
    if (dblAtkSlot) {
        return { type: "atk_mult", targetAttack: letterToAttack(dblAtkSlot[1])!, value: 2, description: text };
    }
    if (/^own attack power is doubled$/i.test(text)) {
        return { type: "atk_mult", targetAttack: "all", value: 2, description: text };
    }
    if (/^own attack power is tripled$/i.test(text)) {
        return { type: "atk_mult", targetAttack: "all", value: 3, description: text };
    }
    if (/^own attack power is halved$/i.test(text)) {
        return { type: "atk_mult", targetAttack: "all", value: 0.5, description: text };
    }

    // --- Attack power: opponent multiply / lower / set ---
    if (/^opponent'?s attack power is doubled$/i.test(text)) {
        return { type: "enemy_atk_mult", value: 2, description: text };
    }
    if (/^opponent'?s attack power is halved$/i.test(text)) {
        return { type: "enemy_atk_halve", description: text };
    }
    const enemyLower = text.match(/^lower opponent'?s attack power -?(\d+)$/i);
    if (enemyLower) {
        return { type: "enemy_atk_lower", value: Number(enemyLower[1]), description: text };
    }
    const enemyBecome = text.match(/^opponent'?s attack power becomes? (\d+)$/i);
    if (enemyBecome) {
        return { type: "enemy_atk_set", value: Number(enemyBecome[1]), description: text };
    }

    // --- Attack power: zero (opponent) ---
    const enemyZeroSlot = text.match(
        /^(?:lower |reduce )?opponent'?s (circle|triangle|cross) attack power (?:is |goes )?(?:to )?0$/i
    );
    if (enemyZeroSlot) {
        return { type: "enemy_atk_zero", targetAttack: letterToAttack(enemyZeroSlot[1])!, description: text };
    }
    if (
        /^opponent'?s attack power (?:is|goes to|becomes?) 0$/i.test(text) ||
        /^(?:reduce|lower) opponent'?s attack power to 0$/i.test(text)
    ) {
        return { type: "enemy_atk_zero", targetAttack: "all", description: text };
    }

    // --- Attack power: set (own) ---
    if (/^own attack power becomes 0$/i.test(text)) {
        return { type: "atk_set", targetAttack: "all", value: 0, description: text };
    }
    if (/^own attack power (?:matches|is same as) own hp$/i.test(text)) {
        return { type: "atk_set_to_hp", targetAttack: "all", description: text };
    }
    const ownSlotHp = text.match(/^own (circle|triangle|cross) attack power becomes same as own hp$/i);
    if (ownSlotHp) {
        return { type: "atk_set_to_hp", targetAttack: letterToAttack(ownSlotHp[1])!, description: text };
    }
    if (/^own attack power is boosted by the number of own hp$/i.test(text)) {
        return { type: "atk_add_hp", description: text };
    }
    const reduceOwn = text.match(/^reduce own attack power by -?(\d+)$/i);
    if (reduceOwn) {
        return { type: "atk_buff", targetAttack: "all", value: -Number(reduceOwn[1]), description: text };
    }
    const lowerBoth = text.match(/^lower both attack powers -?(\d+)$/i);
    if (lowerBoth) {
        return { type: "both_atk_buff", targetAttack: "all", value: -Number(lowerBoth[1]), description: text };
    }
    const bothBoost = text.match(/^boost both players'? attack power \+?(\d+)$/i);
    if (bothBoost) {
        return { type: "both_atk_buff", targetAttack: "all", value: Number(bothBoost[1]), description: text };
    }

    // --- Loose forms used inside "A & B" conditional consequents ---
    const ownAtkPlus = text.match(/^own attack power (?:is )?\+(\d+)$/i);
    if (ownAtkPlus) {
        return { type: "atk_buff", targetAttack: "all", value: Number(ownAtkPlus[1]), description: text };
    }
    const bareHpPlus = text.match(/^hp \+(\d+)$/i);
    if (bareHpPlus) {
        return { type: "hp_heal", value: Number(bareHpPlus[1]), description: text };
    }

    // --- HP: set / double / swap / copy ---
    const ownHpBecome = text.match(/^own hp becomes? (\d+)$/i);
    if (ownHpBecome) {
        return { type: "hp_set", value: Number(ownHpBecome[1]), description: text };
    }
    const enemyHpBecome = text.match(/^opponent'?s hp becomes? (\d+)$/i);
    if (enemyHpBecome) {
        return { type: "enemy_hp_set", value: Number(enemyHpBecome[1]), description: text };
    }
    if (/^own hp becomes? same as opponent'?s$/i.test(text)) {
        return { type: "hp_copy_from_opponent", description: text };
    }
    if (/^opponent'?s hp becomes? same as own$/i.test(text)) {
        return { type: "enemy_hp_copy_from_own", description: text };
    }
    if (/^switch hp with opponent$/i.test(text)) {
        return { type: "hp_swap", description: text };
    }
    if (/^opponent'?s hp are doubled$/i.test(text)) {
        return { type: "enemy_hp_double", description: text };
    }
    const enemyHeal = text.match(/^recover (?:opponent'?s|foe'?s) hp (?:by )?\+?(\d+)$/i);
    if (enemyHeal) {
        return { type: "enemy_hp_heal", value: Number(enemyHeal[1]), description: text };
    }

    // --- Specialty: opponent / both / swap / copy ---
    const enemySpec = text.match(
        /^changes? opponent'?s specialty to (fire|ice|nature|darkness|dark|rare)$/i
    );
    if (enemySpec) {
        return {
            type: "change_enemy_specialty",
            targetAttack: normalizeSpecialtyLabel(enemySpec[1] ?? ""),
            description: text,
        };
    }
    const bothSpec = text.match(
        /^changes? both players'? specialties to (fire|ice|nature|darkness|dark|rare)$/i
    );
    if (bothSpec) {
        return {
            type: "both_change_specialty",
            targetAttack: normalizeSpecialtyLabel(bothSpec[1] ?? ""),
            description: text,
        };
    }
    if (/^swap own specialty with opponent'?s specialty$/i.test(text)) {
        return { type: "swap_specialty", description: text };
    }
    if (/^opponent'?s specialty becomes (?:the )?same as own(?: specialty)?$/i.test(text)) {
        return { type: "enemy_specialty_becomes_own", description: text };
    }

    // --- Own attack change / ordering ---
    const ownAtkBecome = text.match(/^own attack becomes (circle|triangle|cross)$/i);
    if (ownAtkBecome) {
        return { type: "force_self_attack", targetAttack: letterToAttack(ownAtkBecome[1])!, description: text };
    }
    if (
        /^opponent'?s attack changes from circle to triangle, triangle to cross,? or cross to circle$/i.test(
            text
        )
    ) {
        return { type: "rotate_enemy_attack", description: text };
    }
    if (/^attack second$/i.test(text)) {
        return { type: "attack_second", description: text };
    }

    // --- Void support+option, copy full stats ---
    if (/^opponent'?s support and option effects are voided$/i.test(text)) {
        return { type: "void_enemy_support", description: text };
    }
    if (/^own attack power,? hp,? and specialty become same as (?:the )?opponent'?s$/i.test(text)) {
        return { type: "copy_opponent_stats", description: text };
    }

    // --- Extra consequent / clause phrasings ---
    const changeIt = text.match(/^change it to (circle|triangle|cross)$/i);
    if (changeIt) {
        return { type: "change_attack", targetAttack: letterToAttack(changeIt[1])!, description: text };
    }
    const recoverHp = text.match(/^recover hp (?:by )?\+?(\d+)$/i);
    if (recoverHp) {
        return { type: "hp_heal", value: Number(recoverHp[1]), description: text };
    }
    const makeOwnHp = text.match(/^make own hp (\d+)$/i);
    if (makeOwnHp) {
        return { type: "hp_set", value: Number(makeOwnHp[1]), description: text };
    }

    // --- DP Slot (FC-027) ---
    const dpAtkCount = text.match(/^add number of dp cards? in dp slot x(\d+) to own attack power$/i);
    if (dpAtkCount) return { type: "atk_add_dp_count", value: Number(dpAtkCount[1]), description: text };
    const dpHpCount = text.match(/^add number of dp cards? in dp slot x(\d+) to own hp$/i);
    if (dpHpCount) return { type: "hp_add_dp_count", value: Number(dpHpCount[1]), description: text };

    // Atomic discard-then-use-count lines (matched before compose can split them):
    if (
        /^discard (?:all )?(?:cards? in )?own dp slot(?: cards?)?\.? (?:and )?multiply (?:own )?attack power by number of discards$/i.test(
            text
        )
    ) {
        return { type: "atk_mult_by_dp_discards", targetAttack: "all", description: text };
    }
    const dpHpDiscards = text.match(
        /^discard all cards? in (?:own )?dp slot\.? recover hp,? number of discards x(\d+)$/i
    );
    if (dpHpDiscards) return { type: "hp_add_dp_discards", value: Number(dpHpDiscards[1]), description: text };
    if (/^discard all cards? in (?:own )?dp slot\.? opponent discards same number of dp cards$/i.test(text)) {
        return { type: "discard_both_dp_equal", description: text };
    }

    // Simple DP-slot discards (also usable as compose clauses):
    const dpDiscardOwn = text.match(
        /^discard (\d+|all)(?: own)?(?: dp)? cards?(?: shown)?(?: in| from)(?: own)? dp slot$/i
    );
    if (dpDiscardOwn) {
        return {
            type: "discard_own_dp",
            value: /all/i.test(dpDiscardOwn[1]!) ? 0 : Number(dpDiscardOwn[1]),
            description: text,
        };
    }
    const dpDiscardEnemyTop = text.match(
        /^discard opponent'?s (\d+ )?top dp cards?(?: shown)?(?: in| from) (?:opponent'?s )?dp slot$/i
    );
    if (dpDiscardEnemyTop) {
        return {
            type: "discard_enemy_dp",
            value: dpDiscardEnemyTop[1] ? Number(dpDiscardEnemyTop[1]) : 1,
            description: text,
        };
    }
    const dpDiscardEnemyOf = text.match(
        /^discard (\d+) of opponent'?s cards?(?: in| from)(?: opponent'?s)? dp slot$/i
    );
    if (dpDiscardEnemyOf) {
        return { type: "discard_enemy_dp", value: Number(dpDiscardEnemyOf[1]), description: text };
    }
    const dpDiscardEnemyAll = text.match(
        /^discard (\d+|all) opponent'?s cards?(?: in| from)(?: opponent'?s)? dp slot$/i
    );
    if (dpDiscardEnemyAll) {
        return {
            type: "discard_enemy_dp",
            value: /all/i.test(dpDiscardEnemyAll[1]!) ? 0 : Number(dpDiscardEnemyAll[1]),
            description: text,
        };
    }

    // --- Hand / Online Deck manipulation (FC-027) ---
    // Atomic: discard whole hand, multiply attack by the number discarded.
    if (/^discard (?:all cards? in )?own hand\.? multiply (?:own )?attack power by number of discarded cards$/i.test(text)) {
        return { type: "mult_by_hand_discards", targetAttack: "all", description: text };
    }
    if (/^return all cards? in own hand to online deck and shuffle$/i.test(text)) {
        return { type: "return_hand_to_deck_shuffle", description: text };
    }
    if (/^both players discard all cards? in hands?$/i.test(text)) {
        return { type: "discard_both_hands", description: text };
    }
    const drawUntil = text.match(/^draw until there are (\d+) cards? in own hand$/i);
    if (drawUntil) return { type: "draw_until", value: Number(drawUntil[1]), description: text };
    const bothHpSet = text.match(/^hp of both players are (\d+)$/i);
    if (bothHpSet) return { type: "both_hp_set", value: Number(bothHpSet[1]), description: text };

    // Own hand discards.
    const ownHandRandom = text.match(/^(?:randomly discard|discard) (\d+) cards? (?:at random )?from own hand(?: at random)?$/i);
    if (ownHandRandom && /random/i.test(text)) {
        return { type: "discard_own_hand_random", value: Number(ownHandRandom[1]), description: text };
    }
    const ownHandN = text.match(/^discard (\d+) cards? from own hand$/i);
    if (ownHandN) return { type: "discard_own_hand", value: Number(ownHandN[1]), description: text };
    if (/^discard (?:all cards? in own hand|own hand)$/i.test(text)) {
        return { type: "discard_own_hand", value: 0, description: text };
    }

    // Opponent hand discards.
    const enemyHandRandom = text.match(
        /^(?:opponent discards|discard) (\d+) cards? (?:at random )?from (?:opponent'?s )?hand(?: at random)?$/i
    );
    if (enemyHandRandom && /random/i.test(text)) {
        return { type: "discard_enemy_hand_random", value: Number(enemyHandRandom[1]), description: text };
    }
    const enemyDiscAtRandom = text.match(/^opponent discards (\d+) cards? at random$/i);
    if (enemyDiscAtRandom) {
        return { type: "discard_enemy_hand_random", value: Number(enemyDiscAtRandom[1]), description: text };
    }
    if (/^discard all cards? in opponent'?s hand$/i.test(text) || /^opponent discards all cards?$/i.test(text)) {
        return { type: "discard_enemy_hand", value: 0, description: text };
    }

    // Online-deck discards. (Order: both / opponent before bare "own".)
    const bothDeck = text.match(/^discard (\d+) cards? from both players'? online decks?$/i);
    if (bothDeck) return { type: "discard_both_deck", value: Number(bothDeck[1]), description: text };
    const enemyDeck = text.match(
        /^(?:discard (\d+) cards? from opponent'?s online deck|opponent discards (\d+) (?:top )?cards? from(?: opponent'?s)? online deck)$/i
    );
    if (enemyDeck) {
        return { type: "discard_enemy_deck", value: Number(enemyDeck[1] ?? enemyDeck[2]), description: text };
    }
    const ownDeck = text.match(/^discard (\d+) cards? from(?: own)? online deck$/i);
    if (ownDeck) return { type: "discard_own_deck", value: Number(ownDeck[1]), description: text };

    // Offline Pile → Online Deck moves.
    const offlineMove = text.match(/^move (?:the )?top (\d+ )?cards? from offline pile to online deck$/i);
    if (offlineMove) {
        return { type: "offline_to_online", value: offlineMove[1] ? Number(offlineMove[1]) : 1, description: text };
    }
    if (/^shuffle$/i.test(text)) {
        return { type: "shuffle_deck", description: text };
    }

    // --- On-KO revive ("...revives with N HP. Battle is still lost.") ---
    const revive = text.match(
        /^(?:digimon ko'?d in battle revives|ko'?d digimon revives) with (\d+)(?: hp)?\.?\s*(?:battle is still lost)?\.?$/i
    );
    if (revive) return { type: "revive", value: Number(revive[1]), description: text };

    // --- Support-granted counterattack (reflect + nullify a matching attack) ---
    const counterSlot = text.match(/^(circle|triangle|cross) counterattack$/i);
    if (counterSlot) {
        return { type: "grant_counter", targetAttack: letterToAttack(counterSlot[1])!, description: text };
    }
    if (/^counterattack$/i.test(text)) {
        return { type: "grant_counter", targetAttack: "all", description: text };
    }

    return null;
}

/**
 * A conditional line ("If <gate>, <consequent>") whose gate is recognized and
 * whose consequent fully parses. Stored as `type: "conditional"` with the full
 * text; the resolver re-parses and evaluates it at battle time (FC-027).
 * `&`-joined consequents (e.g. "own Attack Power +200 & HP +200") are split too.
 */
/** Split a conditional consequent on its clause separators (`&`, `and`, `,`, `.`). */
export function splitConsequentClauses(consequent: string): string[] {
    return splitEffectClauses(consequent.replace(/\s*&\s*|\s+and\s+|,\s*/gi, ". "));
}

export function inferConditionalEffect(text: string): InferredSupportEffect | null {
    const split = splitConditional(canonicalizeEffectText(text));
    if (!split) return null;
    if (!parseCondition(split.head)) return null;
    const clauses = splitConsequentClauses(split.consequent);
    if (clauses.length === 0) return null;
    if (clauses.some(c => inferSupportEffectFromDescription(c) == null)) return null;
    return { type: "conditional", description: text.trim() };
}

/** True when a single clause maps to a known primitive or a conditional gate. */
function clauseParses(clause: string): boolean {
    return inferSupportEffectFromDescription(clause) != null || inferConditionalEffect(clause) != null;
}

/**
 * Split a compound (non-conditional) effect into clauses. Prefer period-only
 * splitting so conjunctions inside a single primitive ("Circle & Triangle
 * Attack Power are 0", "Support and Option Effects are voided") stay intact;
 * only fall back to comma/"and"/"&" splitting when the period split does not
 * fully parse.
 */
export function splitComposeClauses(text: string): string[] {
    const byPeriod = splitEffectClauses(text);
    if (byPeriod.length >= 2 && byPeriod.every(clauseParses)) return byPeriod;
    return splitConsequentClauses(text);
}

/**
 * If every clause maps to a known support primitive, return a compose effect
 * (or the single primitive when there is only one clause).
 */
export function inferCompoundSupportEffect(
    description: string
): InferredSupportEffect | null {
    const text = description.trim();
    if (!text || /^none\.?$/i.test(text)) return null;

    const single = inferSupportEffectFromDescription(text);
    if (single) return single;

    const conditional = inferConditionalEffect(text);
    if (conditional) return conditional;

    const clauses = splitComposeClauses(text);
    if (clauses.length < 2) return null;

    if (clauses.some(c => !clauseParses(c))) return null;

    return {
        type: "compose",
        description: text,
    };
}

/** Map inferred support type → card-level effectId (options / digimon). */
export function supportTypeToEffectId(
    type: string
): { effectId: string; effectArgs: EffectArgs } | null {
    switch (type) {
        case "void_enemy_support":
            return { effectId: "support.void_enemy_support", effectArgs: {} };
        case "first_strike":
            return { effectId: "support.first_strike", effectArgs: {} };
        case "halve_hp":
            return { effectId: "support.halve_hp", effectArgs: {} };
        case "self_halve_hp":
            return { effectId: "support.self_halve_hp", effectArgs: {} };
        case "both_halve_hp":
            return { effectId: "support.both_halve_hp", effectArgs: {} };
        case "change_attack":
            return { effectId: "support.change_attack", effectArgs: {} };
        case "both_change_attack":
            return { effectId: "support.both_change_attack", effectArgs: {} };
        case "atk_buff":
            return { effectId: "support.atk_buff", effectArgs: {} };
        case "both_atk_buff":
            return { effectId: "support.both_atk_buff", effectArgs: {} };
        case "both_atk_zero":
            return { effectId: "support.both_atk_zero", effectArgs: {} };
        case "hp_heal":
            return { effectId: "support.hp_heal", effectArgs: {} };
        case "atk_mult":
            return { effectId: "support.atk_mult", effectArgs: {} };
        case "change_own_specialty":
            return { effectId: "support.change_own_specialty", effectArgs: {} };
        case "hand_x_atk":
            return { effectId: "support.hand_x_atk", effectArgs: {} };
        case "grant_eat_up_hp":
            return { effectId: "support.grant_eat_up_hp", effectArgs: {} };
        case "zero_attacks":
            return { effectId: "support.zero_attacks", effectArgs: {} };
        case "draw_cards":
            return { effectId: "support.draw_cards", effectArgs: {} };
        case "compose":
            return { effectId: "support.compose", effectArgs: {} };
        case "conditional":
            return { effectId: "support.conditional", effectArgs: {} };
        default:
            // Phase-1 primitives (atk_set, enemy_*, hp_*, swap_specialty, …) resolve
            // by type at runtime; expose a stable id so the catalog marks them mapped.
            return type ? { effectId: `support.${type}`, effectArgs: {} } : null;
    }
}
