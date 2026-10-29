#!/usr/bin/env tsx
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { inferCompoundSupportEffect } from "../src/lib/effectTextNormalize";
import { isEffectPlan } from "../src/lib/effectPlan";

type CatalogCard = {
    id: string;
    cardKind?: string;
    supportEffect?: {
        type?: string;
        description?: string;
        effectPlan?: unknown;
    } | null;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cards = JSON.parse(readFileSync(path.join(root, "src/data/cards.json"), "utf8")) as CatalogCard[];
const supportTypeCounts: Record<string, number> = {};
const unresolved: Array<{ id: string; type: string }> = [];
const missingPlan: string[] = [];
const invalidPlan: string[] = [];
const eligibleCards: Array<{ id: string; type: string; planStatus: string }> = [];
let eligiblePlanCount = 0;
let validPlanCount = 0;

for (const card of cards) {
    const effect = card.supportEffect;
    if (!effect) continue;

    const type = effect.type ?? "";
    supportTypeCounts[type] = (supportTypeCounts[type] ?? 0) + 1;
    if (type !== "catalog_text" && type !== "compose" && type !== "conditional") continue;

    const inferred = inferCompoundSupportEffect(effect.description ?? "");
    if (!inferred) {
        unresolved.push({ id: card.id, type });
        eligibleCards.push({ id: card.id, type, planStatus: "unresolved" });
        continue;
    }

    eligiblePlanCount += 1;
    if (effect.effectPlan == null) {
        missingPlan.push(card.id);
        eligibleCards.push({ id: card.id, type, planStatus: "missing" });
    } else if (!isEffectPlan(effect.effectPlan)) {
        invalidPlan.push(card.id);
        eligibleCards.push({ id: card.id, type, planStatus: "invalid" });
    } else {
        validPlanCount += 1;
        eligibleCards.push({ id: card.id, type, planStatus: "valid" });
    }
}

const sortedCounts = Object.fromEntries(
    Object.entries(supportTypeCounts).sort(([left], [right]) => left.localeCompare(right))
);
const sorted = (ids: string[]) => ids.sort((left, right) => left.localeCompare(right));

console.log(
    JSON.stringify(
        {
            totalCards: cards.length,
            optionCards: cards.filter(card => card.cardKind === "option").length,
            supportEffectTypeCounts: sortedCounts,
            eligiblePlanCount,
            validPlanCount,
            missingPlanIds: sorted(missingPlan),
            invalidPlanIds: sorted(invalidPlan),
            unresolved: unresolved.sort((left, right) => left.id.localeCompare(right.id)),
            eligibleCards: eligibleCards.sort((left, right) => left.id.localeCompare(right.id)),
            note: "Parser recognition is an inventory signal, not proof that every clause executes; verify plan semantics at runtime.",
        },
        null,
        2
    )
);
