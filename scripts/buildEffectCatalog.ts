/**
 * Build `src/data/effects.json` from AsyrafKZ unique effect lists.
 *
 * Source: scripts/data/asyrafkz/effectList2.txt
 * (https://github.com/AsyrafKZ/digital-card-battle-clone-data-collection)
 *
 * Run: pnpm exec tsx scripts/buildEffectCatalog.ts
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

export type EffectKind =
    | "cross"
    | "support"
    | "option"
    | "evolution"
    | "mixed"
    | "unknown";

export type EffectCatalogEntry = {
    /** Stable slug id for this effect text. */
    id: string;
    /** Canonical display text (wiki button markup cleaned). */
    text: string;
    /** Original line from effectList2.txt */
    sourceText: string;
    kind: EffectKind;
    /** Mapped runtime effectId when implemented. */
    implementedEffectId?: string;
    implementedArgs?: Record<string, string | number | boolean>;
    status: "implemented" | "partial" | "catalog_only";
};

function cleanText(raw: string): string {
    return raw
        .replace(/\{\{button\|c\}\}/gi, "Circle")
        .replace(/\{\{button\|t\}\}/gi, "Triangle")
        .replace(/\{\{button\|x\}\}/gi, "Cross")
        .replace(/\{\{button\|o\}\}/gi, "Circle")
        .replace(/\s+/g, " ")
        .trim();
}

function slugify(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 80);
}

function letterToAttack(letter: string): "circle" | "triangle" | "cross" {
    const l = letter.toLowerCase();
    if (l === "o" || l === "c" || l === "circle") return "circle";
    if (l === "t" || l === "triangle") return "triangle";
    return "cross";
}

function classifyAndMap(sourceText: string): Omit<EffectCatalogEntry, "id" | "text" | "sourceText"> {
    const text = cleanText(sourceText);
    const lower = text.toLowerCase();

    // --- Cross attack specials ---
    const counterOnly = lower.match(/^(circle|triangle|cross) counter$/);
    if (counterOnly) {
        return {
            kind: "cross",
            implementedEffectId: "cross.counter",
            implementedArgs: { targetAttack: letterToAttack(counterOnly[1]), multiplier: 2 },
            status: "implemented",
        };
    }
    const toZeroOnly = lower.match(/^(circle|triangle|cross) to 0$/);
    if (toZeroOnly) {
        return {
            kind: "cross",
            implementedEffectId: "cross.to_zero",
            implementedArgs: { targetAttack: letterToAttack(toZeroOnly[1]) },
            status: "implemented",
        };
    }
    if (lower === "crash") {
        return { kind: "cross", implementedEffectId: "cross.crash", implementedArgs: {}, status: "implemented" };
    }
    if (lower === "eat-up hp" || lower === "eat up hp") {
        return { kind: "cross", implementedEffectId: "cross.eat_up_hp", implementedArgs: {}, status: "implemented" };
    }
    if (/foe x\d/.test(lower)) {
        const foe = text.match(/^(Dark(?:ness)?|Fire|Ice|Nature|Rare)\s+Foe\s+x(\d+)\.?$/i);
        if (foe) {
            const specialty = /^dark/i.test(foe[1] ?? "")
                ? "Dark"
                : String(foe[1]?.[0] ?? "X").toUpperCase() + String(foe[1] ?? "").slice(1).toLowerCase();
            return {
                kind: "cross",
                implementedEffectId: "attack.specialty_mult",
                implementedArgs: { specialty, multiplier: Number(foe[2]) },
                status: "implemented",
            };
        }
    }
    if (lower === "jamming") {
        return {
            kind: "cross",
            implementedEffectId: "attack.jamming",
            implementedArgs: {},
            status: "implemented",
        };
    }
    if (lower === "1st attack") {
        return {
            kind: "cross",
            implementedEffectId: "attack.first_strike",
            implementedArgs: {},
            status: "implemented",
        };
    }

    // --- Evolution options ---
    if (/can digivolve|disregard dp in digivolving|downgrade|de-armor|armorcrush/i.test(text)) {
        if (/from r to u/i.test(text)) {
            return {
                kind: "evolution",
                implementedEffectId: "evolution_option.warp_evolve",
                implementedArgs: { skipLevels: 1 },
                status: "implemented",
            };
        }
        if (/adding dp \+?20/i.test(text)) {
            return {
                kind: "evolution",
                implementedEffectId: "evolution_option.dp_adjust",
                implementedArgs: { delta: 20 },
                status: "implemented",
            };
        }
        if (/disregard dp/i.test(text)) {
            return {
                kind: "evolution",
                implementedEffectId: "evolution_option.dp_adjust",
                implementedArgs: { delta: -999 },
                status: "partial",
            };
        }
        return { kind: "evolution", status: "catalog_only" };
    }

    // --- Support / option effects we implement ---
    if (/^opponent'?s support effect is voided\.?$/i.test(text)) {
        return {
            kind: "support",
            implementedEffectId: "support.void_enemy_support",
            implementedArgs: {},
            status: "implemented",
        };
    }
    if (/^attack first\.?$/i.test(text)) {
        return {
            kind: "support",
            implementedEffectId: "support.first_strike",
            implementedArgs: {},
            status: "implemented",
        };
    }

    const forceAtk = text.match(/^opponent uses (circle|triangle|cross)\.?$/i);
    if (forceAtk) {
        return {
            kind: "support",
            implementedEffectId: "support.change_attack",
            implementedArgs: { targetAttack: letterToAttack(forceAtk[1]) },
            status: "implemented",
        };
    }

    const buffO = text.match(/^boost own circle attack power \+?(\d+)\.?$/i);
    if (buffO) {
        return {
            kind: "support",
            implementedEffectId: "support.atk_buff",
            implementedArgs: { targetAttack: "circle", value: Number(buffO[1]) },
            status: "implemented",
        };
    }
    const buffT = text.match(/^boost own triangle attack power \+?(\d+)\.?$/i);
    if (buffT) {
        return {
            kind: "support",
            implementedEffectId: "support.atk_buff",
            implementedArgs: { targetAttack: "triangle", value: Number(buffT[1]) },
            status: "implemented",
        };
    }
    const buffX = text.match(/^boost own cross attack power \+?(\d+)\.?$/i);
    if (buffX) {
        return {
            kind: "support",
            implementedEffectId: "support.atk_buff",
            implementedArgs: { targetAttack: "cross", value: Number(buffX[1]) },
            status: "implemented",
        };
    }
    const buffAll = text.match(/^boost own attack power \+?(\d+)\.?$/i);
    if (buffAll) {
        return {
            kind: "support",
            implementedEffectId: "support.atk_buff",
            implementedArgs: { targetAttack: "all", value: Number(buffAll[1]) },
            status: "implemented",
        };
    }

    const heal = text.match(/^recover own hp (?:by )?\+?(\d+)\.?$/i);
    if (heal) {
        return {
            kind: "support",
            implementedEffectId: "support.hp_heal",
            implementedArgs: { value: Number(heal[1]) },
            status: "implemented",
        };
    }

    if (/^opponent'?s hp are halved\.?$/i.test(text)) {
        return {
            kind: "support",
            implementedEffectId: "support.halve_hp",
            implementedArgs: {},
            status: "implemented",
        };
    }

    // Draw / heal patterns often appear on options
    const draw = text.match(/^draw (\d+) cards?/i);
    if (draw) {
        return {
            kind: "option",
            implementedEffectId: "option.prep.draw",
            implementedArgs: { count: Number(draw[1]) },
            status: "implemented",
        };
    }

    // Multi-clause effects
    if (text.includes(".") && text.split(".").filter(s => s.trim()).length > 1) {
        return { kind: "mixed", status: "catalog_only" };
    }

    return { kind: "unknown", status: "catalog_only" };
}

function main() {
    const listPath = path.join(ROOT, "scripts/data/asyrafkz/effectList2.txt");
    const outPath = path.join(ROOT, "src/data/effects.json");
    const lines = fs
        .readFileSync(listPath, "utf8")
        .split("\n")
        .map(l => l.trim())
        .filter(Boolean);

    const seen = new Set<string>();
    const effects: EffectCatalogEntry[] = [];

    for (const sourceText of lines) {
        const text = cleanText(sourceText);
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);

        const mapped = classifyAndMap(sourceText);
        effects.push({
            id: `fx_${slugify(text)}`,
            text,
            sourceText,
            ...mapped,
        });
    }

    effects.sort((a, b) => a.text.localeCompare(b.text));

    const byStatus = effects.reduce(
        (acc, e) => {
            acc[e.status] = (acc[e.status] ?? 0) + 1;
            return acc;
        },
        {} as Record<string, number>
    );
    const byKind = effects.reduce(
        (acc, e) => {
            acc[e.kind] = (acc[e.kind] ?? 0) + 1;
            return acc;
        },
        {} as Record<string, number>
    );

    const payload = {
        source: "https://github.com/AsyrafKZ/digital-card-battle-clone-data-collection",
        sourceFile: "scripts/data/asyrafkz/effectList2.txt",
        generatedAt: new Date().toISOString(),
        counts: {
            total: effects.length,
            byStatus,
            byKind,
        },
        effects,
    };

    fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
    console.log(`Wrote ${effects.length} effects → ${path.relative(ROOT, outPath)}`);
    console.log("  by status:", byStatus);
    console.log("  by kind:", byKind);
}

main();
