#!/usr/bin/env tsx
/**
 * Documentation truth pass (leaf-1.2.2).
 *
 * Each mode recomputes a documented claim from the artifact or the shipped
 * runtime and compares it with what the document actually states. No expected
 * value is copied from the brief: the measured side always comes from
 * `src/data/effects.json`, from the resolver in `src/lib/supportResolver.ts`,
 * or from `BattleRoom`.
 *
 * Usage: npx tsx scripts/verify-doc-truth.ts <G1|G2|G3|G5>
 *
 * G1  FC-027 coverage numbers in docs == recomputed `effects.json` counts
 * G2  no document calls an implemented mechanism `catalog_only`
 * G3  GDD.md discard destination == shipped dpSlot routing
 * G5  docs/2.3 §2B reads as the equal-speed fallback, not the primary key
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { CardSchema, PlayerSchema, SupportEffectSchema } from "../src/schema/BattleState";
import {
    createSupportBattleContext,
    effectClassPriority,
    effectPriority,
    getAttackDamageBreakdown,
    resolveSupportPhase,
    type SupportBattleContext,
} from "../src/lib/supportResolver";
import { inferCompoundSupportEffect } from "../src/lib/effectTextNormalize";
import { applyDiscardForDp } from "../src/lib/discardForDp";
import {
    resolvePrepOption,
    type OptionCardLike,
    type PrepOptionMutableState,
} from "../src/lib/optionResolver";
import { BattleRoom } from "../src/rooms/BattleRoom";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKLOG = path.join(ROOT, "docs/8.0 Fidelity Checklist & Epic Backlog.md");
const SUPPORT_SPEC = path.join(ROOT, "docs/2.3 Support Phase & Conflict Resolution.md");
const GDD = path.join(ROOT, "GDD.md");
const EFFECTS = path.join(ROOT, "src/data/effects.json");
const HUD = path.join(ROOT, "src/components/BattleHUD.tsx");

/** Every document this leaf owns: `docs/**` plus the GDD. */
function docFiles(): string[] {
    const docs = readdirSync(path.join(ROOT, "docs"))
        .filter(name => name.endsWith(".md"))
        .map(name => path.join(ROOT, "docs", name));
    return [...docs, GDD].sort();
}

/**
 * Sentence split that keeps a claim next to the subject it names. Only a
 * sentence-terminating period or a line break starts a new claim; a semicolon
 * continues the one being made, so it must not fragment the check.
 */
function sentences(text: string): string[] {
    return text
        .split(/\r?\n/)
        .flatMap(line => line.split(/(?<=\.)\s+(?=[A-Z("'`*\d])/))
        .map(s => s.trim())
        .filter(Boolean);
}

/** Blank-line-separated blocks; the unit a prose claim is stated in. */
function paragraphs(text: string): string[] {
    return text
        .split(/\n\s*\n/)
        .map(block => block.replace(/\s+/g, " ").trim())
        .filter(Boolean);
}

function lineOf(text: string, needle: string): number {
    const index = text.split(/\r?\n/).findIndex(line => line.includes(needle));
    return index === -1 ? 0 : index + 1;
}

/** Line number of a character offset; two hits on one line stay distinguishable. */
function lineAt(text: string, offset: number): number {
    let line = 1;
    for (let i = 0; i < offset && i < text.length; i += 1) {
        if (text[i] === "\n") line += 1;
    }
    return line;
}

// ---------------------------------------------------------------------------
// Artifact measurement — the truth side of the G1 comparison
// ---------------------------------------------------------------------------

type EffectStatus = "implemented" | "partial" | "catalog_only";

type EffectEntry = {
    id: string;
    text: string;
    status: EffectStatus;
};

type EffectCounts = {
    total: number;
    byStatus: Record<EffectStatus, number>;
};

/** The `counts` block as written in the artifact, which must agree with `effects[]`. */
type DeclaredCounts = {
    total?: number;
    byStatus?: Partial<Record<EffectStatus, number>>;
};

type EffectArtifact = {
    entries: EffectEntry[];
    counts: EffectCounts;
    declared: DeclaredCounts;
};

function loadEffectArtifact(): EffectArtifact {
    const raw = JSON.parse(readFileSync(EFFECTS, "utf8")) as {
        effects?: EffectEntry[];
        counts?: DeclaredCounts;
    };
    if (!Array.isArray(raw.effects)) throw new Error("effects.json has no `effects` array");

    const byStatus: Record<EffectStatus, number> = {
        implemented: 0,
        partial: 0,
        catalog_only: 0,
    };
    for (const entry of raw.effects) {
        if (!(entry.status in byStatus)) {
            throw new Error(`effects.json entry ${entry.id} has unknown status ${entry.status}`);
        }
        byStatus[entry.status] += 1;
    }
    return {
        entries: raw.effects,
        counts: { total: raw.effects.length, byStatus },
        declared: raw.counts ?? {},
    };
}

// ---------------------------------------------------------------------------
// Runtime probes — the truth side of the G2/G3/G5 comparisons
// ---------------------------------------------------------------------------

function makePlayer(sessionId: string, hp = 1000): PlayerSchema {
    const player = new PlayerSchema();
    player.sessionId = sessionId;
    player.hp = hp;
    const active = new CardSchema();
    active.id = `${sessionId}-active`;
    active.cardKind = "digimon";
    active.type = "Fire";
    active.level = "Champion";
    active.maxHp = hp;
    active.hp = hp;
    active.circle.damage = 400;
    active.triangle.damage = 300;
    active.cross.damage = 200;
    player.active = active;
    return player;
}

/** A support card carrying exactly the primitive a document names. */
function cardOfPrimitive(
    id: string,
    type: string,
    value: number,
    priority?: number
): CardSchema {
    const card = new CardSchema();
    card.id = id;
    card.cardKind = "digimon";
    const effect = new SupportEffectSchema();
    effect.type = type;
    effect.value = value;
    effect.targetAttack = "all";
    effect.description = type;
    if (priority !== undefined) effect.priority = priority;
    card.supportEffect = effect;
    return card;
}

/** A support card built from the shipped text→effect inference, as the loader does. */
function cardOfText(id: string, text: string, priority?: number): CardSchema {
    const inferred = inferCompoundSupportEffect(text);
    if (!inferred) throw new Error(`no support inference for effect text: ${text}`);
    const card = new CardSchema();
    card.id = id;
    card.cardKind = "digimon";
    const effect = new SupportEffectSchema();
    effect.type = inferred.type;
    effect.value = inferred.value ?? 0;
    effect.targetAttack = inferred.targetAttack ?? "";
    effect.description = inferred.description ?? text;
    if (priority !== undefined) effect.priority = priority;
    card.supportEffect = effect;
    return card;
}

function freshContext(): {
    active: PlayerSchema;
    defender: PlayerSchema;
    ctx: SupportBattleContext;
} {
    return {
        active: makePlayer("a"),
        defender: makePlayer("d"),
        ctx: createSupportBattleContext(),
    };
}

/** Resolve one text-derived support card played by the active player. */
function resolveText(text: string, hooks?: Parameters<typeof resolveSupportPhase>[6]) {
    const { active, defender, ctx } = freshContext();
    resolveSupportPhase(active, defender, cardOfText("probe", text), null, ctx, undefined, hooks);
    return { active, defender, ctx };
}

const COUNTER_AND_SECOND = "Circle Counterattack. Attack second.";
const REVIVE = "Digimon KO'd in battle revives with 500 HP. Battle is still lost.";
const DISCARD_COST = "Discard 1 Card from own Hand. Boost both players' Attack Power +600.";
const SPECIALTY_DRAW = "Changes opponent's Specialty to Ice. Draw 1 Card from own Online Deck.";

/**
 * Mechanisms the documents name, each paired with a probe that reports whether
 * the shipped resolver actually acts on it. The probe is the discriminator: a
 * genuinely `catalog_only` line (see the positive control in `g2`) infers to no
 * runtime effect and mutates nothing.
 */
const MECHANISMS: { label: string; keywords: RegExp; live: () => boolean }[] = [
    {
        label: "counterattack",
        keywords: /counterattack/i,
        live: () => resolveText(COUNTER_AND_SECOND).ctx.counterGrants.size > 0,
    },
    {
        label: "attack-second",
        keywords: /attack[\s-]second/i,
        live: () => resolveText(COUNTER_AND_SECOND).ctx.attackSecondPlayers.size > 0,
    },
    {
        label: "revive",
        keywords: /\brevive\b/i,
        live: () => resolveText(REVIVE).ctx.reviveHp.size > 0,
    },
    {
        label: "discard-cost",
        keywords: /discard[\s-]*costs?/i,
        live: () => {
            const { active, defender, ctx } = freshContext();
            const handCard = new CardSchema();
            handCard.id = "h1";
            handCard.cardKind = "digimon";
            active.hand.push(handCard);
            resolveSupportPhase(active, defender, cardOfText("probe", DISCARD_COST), null, ctx);
            return active.hand.length === 0 && ctx.attackBonus.has("a");
        },
    },
    {
        label: "opponent-specialty+draw",
        keywords: /opponent[\s-]*specialty/i,
        live: () => {
            let drawn = 0;
            const { defender } = resolveText(SPECIALTY_DRAW, {
                drawCards: () => {
                    drawn += 1;
                },
            });
            return defender.active?.type === "Ice" && drawn === 1;
        },
    },
];

// ---------------------------------------------------------------------------
// G1 — FC-027 coverage numbers equal the measured effects.json counts
// ---------------------------------------------------------------------------

function g1(fail: (msg: string) => void): void {
    const { counts, declared } = loadEffectArtifact();

    for (const status of ["implemented", "partial", "catalog_only"] as EffectStatus[]) {
        const stated = declared.byStatus?.[status];
        if (stated !== counts.byStatus[status]) {
            fail(
                `effects.json counts.byStatus.${status} = ${stated} but recomputing from ` +
                    `effects[] gives ${counts.byStatus[status]}`
            );
        }
    }
    if (declared.total !== counts.total) {
        fail(
            `effects.json counts.total = ${declared.total} but effects[] holds ${counts.total} ` +
                `entries`
        );
    }

    // Numbers the documents state, parsed out of the documents themselves.
    const claimed = {
        coverage: false,
        catalogOnly: false,
        partial: false,
    };
    for (const file of docFiles()) {
        const text = readFileSync(file, "utf8");

        for (const match of text.matchAll(/(?<![\w/])(\d+)\s*\/\s*(\d+)\s*\**\s*effect lines implemented/g)) {
            claimed.coverage = true;
            const implemented = Number(match[1]);
            const total = Number(match[2]);
            const where = `${path.relative(ROOT, file)}:${lineAt(text, match.index)}`;
            if (implemented !== counts.byStatus.implemented) {
                fail(
                    `${where} states ${implemented} effect lines implemented; effects.json ` +
                        `measures ${counts.byStatus.implemented}`
                );
            }
            if (total !== counts.total) {
                fail(
                    `${where} states ${total} total effect lines; effects.json holds ` +
                        `${counts.total}`
                );
            }
        }

        // Every "<n> [are|is] `status`" count in a document, whatever the
        // phrasing, so a stray figure in a table cell is verified too.
        for (const status of ["implemented", "partial", "catalog_only"] as EffectStatus[]) {
            const pattern = new RegExp(
                `(?<![\\w/])(\\d+)\\s+(?:are\\s+|is\\s+)?\`?${status}\`?`,
                "g"
            );
            for (const match of text.matchAll(pattern)) {
                if (status === "implemented") claimed.coverage = true;
                if (status === "partial") claimed.partial = true;
                if (status === "catalog_only") claimed.catalogOnly = true;
                const stated = Number(match[1]);
                if (stated !== counts.byStatus[status]) {
                    fail(
                        `${path.relative(ROOT, file)}:${lineAt(text, match.index)} states ` +
                            `${stated} ${status} effect lines; effects.json measures ` +
                            `${counts.byStatus[status]}`
                    );
                }
            }
        }
    }

    if (!claimed.coverage) {
        fail(
            "no document states an `N/TOTAL effect lines implemented` figure, so the measured " +
                "coverage count goes unclaimed"
        );
    }
    if (!claimed.catalogOnly) {
        fail("no document states how many catalog_only effect lines remain");
    }
    if (!claimed.partial) {
        fail("no document states how many partial effect lines remain");
    }

    // A remainder claim must not present catalog_only as the whole story while
    // partial lines remain: "the remaining lines are catalog_only" is false
    // whenever the artifact also holds partials.
    for (const file of docFiles()) {
        const text = readFileSync(file, "utf8");
        for (const sentence of sentences(text)) {
            if (!/catalog_only/.test(sentence)) continue;
            if (!/\bremain(?:ing|s)?\b|\bstill\b/i.test(sentence)) continue;
            if (/\bpartial\b/i.test(sentence)) continue;
            if (counts.byStatus.partial === 0) continue;
            fail(
                `${path.relative(ROOT, file)}:${lineOf(text, sentence)} describes the remaining ` +
                    `FC-027 lines as catalog_only only, but ${counts.byStatus.partial} partial ` +
                    `line(s) also remain: "${sentence}"`
            );
        }
    }

    // A DONE row is only honest when nothing is left over.
    const backlog = readFileSync(BACKLOG, "utf8");
    const row = backlog.split(/\r?\n/).find(line => line.startsWith("| FC-027 |"));
    if (!row) {
        fail("docs/8.0 has no FC-027 row");
        return;
    }
    const status = row.split("|")[3]?.trim() ?? "";
    const remaining = counts.byStatus.catalog_only + counts.byStatus.partial;
    if (status === "DONE" && remaining > 0) {
        fail(`the FC-027 row is marked DONE while ${remaining} effect lines remain unimplemented`);
    }
    if (status === "NOT STARTED" && counts.byStatus.implemented > 0) {
        fail(
            `the FC-027 row is marked NOT STARTED while ${counts.byStatus.implemented} lines are ` +
                `implemented`
        );
    }
}

// ---------------------------------------------------------------------------
// G2 — no document calls an implemented mechanism catalog_only
// ---------------------------------------------------------------------------

function g2(fail: (msg: string) => void): void {
    const { entries } = loadEffectArtifact();
    const catalogOnly = entries.filter(entry => entry.status === "catalog_only");
    if (catalogOnly.length === 0) {
        fail("effects.json has no catalog_only entries, so this gate cannot discriminate");
        return;
    }

    // Positive control for the probe: a line the artifact calls catalog_only
    // must infer to no runtime effect at all, so "live" below really separates
    // an implemented mechanism from a genuinely unimplemented one.
    for (const entry of catalogOnly) {
        if (inferCompoundSupportEffect(entry.text)) {
            fail(
                `effects.json marks "${entry.text}" catalog_only, yet it infers to a runtime ` +
                    `effect; the artifact status is wrong`
            );
        }
    }

    for (const file of docFiles()) {
        const text = readFileSync(file, "utf8");
        for (const sentence of sentences(text)) {
            if (!/catalog_only/.test(sentence)) continue;
            for (const mechanism of MECHANISMS) {
                if (!mechanism.keywords.test(sentence)) continue;
                if (!mechanism.live()) continue;
                fail(
                    `${path.relative(ROOT, file)}:${lineOf(text, sentence)} calls the implemented ` +
                        `"${mechanism.label}" mechanism catalog_only: "${sentence}"`
                );
            }
        }
    }
}

// ---------------------------------------------------------------------------
// G3 — GDD.md discard destination matches shipped dpSlot routing
// ---------------------------------------------------------------------------

async function g3(fail: (msg: string) => void): Promise<void> {
    const gdd = readFileSync(GDD, "utf8");

    // 1. The documented destination. The step must name the DP Slot as where
    //    discards go, and must never send them to the Trash. Contrastive
    //    mentions ("separate from the Trash") are not destination claims.
    const prepDiscardLines = gdd
        .split(/\r?\n/)
        .map((line, index) => ({ line, number: index + 1 }))
        .filter(
            ({ line }) =>
                /discard/i.test(line) && /DP gauge|gain(?:ing|s)? DP|generate DP/i.test(line)
        );
    if (prepDiscardLines.length === 0) {
        fail("GDD.md no longer describes the prep discard-for-DP step");
    }
    for (const { line, number } of prepDiscardLines) {
        if (/(?:to|into)\s+the\s+\**\s*Trash/i.test(line)) {
            fail(`GDD.md:${number} still sends prep discards to the Trash: "${line.trim()}"`);
        }
        if (!/(?:to|into)\s+the\s+\**\s*DP Slot/i.test(line)) {
            fail(`GDD.md:${number} does not name the DP Slot as the discard destination`);
        }
    }

    // 2. The Trash-only scope of the prep fetch option.
    if (
        !paragraphs(gdd).some(
            block => /DP Slot/i.test(block) && /Trash only/i.test(block) && /fetch/i.test(block)
        )
    ) {
        fail(
            "GDD.md does not state that option.prep.fetch_trash_digimon searches the Trash only, " +
                "so DP Slot cards are not reachable"
        );
    }

    // 3. Shipped routing: the room sends prep discards to dpSlot, not trash.
    // `discardForDp` is private and reached in production through the
    // "DISCARD_FOR_DP" action message. Narrow to a named view for the probe
    // (same convention as scripts/verify-option-dispatch.ts).
    const realLog = console.log;
    const routed = { dpSlot: -1, trash: -1, dp: -1 };
    try {
        console.log = () => {};
        const room = new BattleRoom() as unknown as {
            onCreate(options: Record<string, unknown>): void;
            discardForDp(player: PlayerSchema, cardIds: string[]): { dpGained: number };
        };
        await room.onCreate({});
        const player = new PlayerSchema();
        player.sessionId = "doc-truth-probe";
        const handCard = new CardSchema();
        handCard.id = "c1";
        handCard.cardKind = "digimon";
        handCard.plusDp = 10;
        player.hand.push(handCard);
        const result = room.discardForDp(player, ["c1"]);
        routed.dpSlot = player.dpSlot.length;
        routed.trash = player.trash.length;
        routed.dp = result.dpGained;
    } finally {
        console.log = realLog;
    }
    if (routed.dpSlot !== 1 || routed.trash !== 0 || routed.dp !== 10) {
        fail(
            `BattleRoom.discardForDp routed to dpSlot=${routed.dpSlot} trash=${routed.trash} ` +
                `dp=${routed.dp}; the shipped destination is dpSlot=1 trash=0 dp=10`
        );
    }

    // 4. The seat readout counts DP Slot cards together with Trash.
    const hud = readFileSync(HUD, "utf8");
    if (!/trash\.length\s*\+\s*\(\s*[\w.]+\.dpSlot\?\.length\s*\?\?\s*0\s*\)/.test(hud)) {
        fail("BattleHUD.tsx no longer adds dpSlot length into the displayed trash count");
    }

    // 5. The prep fetch option reaches the Trash and never the DP Slot.
    const optionCard: OptionCardLike = {
        id: "opt",
        cardKind: "option",
        effectId: "option.prep.fetch_trash_digimon",
    };
    const emptyTrash: PrepOptionMutableState = {
        dp: 0,
        hp: 0,
        maxHp: 0,
        hand: [],
        deck: [],
        trash: [],
    };
    if (resolvePrepOption(optionCard, emptyTrash, () => 0).ok) {
        fail("option.prep.fetch_trash_digimon succeeded with an empty Trash");
    }
    const stockedTrash: PrepOptionMutableState = {
        dp: 0,
        hp: 0,
        maxHp: 0,
        hand: [],
        deck: [],
        trash: [{ id: "slot-1", cardKind: "digimon", effectId: "" }],
    };
    const fetched = resolvePrepOption(optionCard, stockedTrash, () => 0);
    if (!fetched.ok || stockedTrash.hand.length !== 1 || stockedTrash.trash.length !== 0) {
        fail("option.prep.fetch_trash_digimon failed to fetch a Digimon from the Trash");
    }

    // 6. The shipped discard primitive keeps the destination it is handed.
    const hand = [{ id: "c2", cardKind: "digimon", plusDp: 10 }];
    const slotPile: typeof hand = [];
    const trashPile: typeof hand = [];
    applyDiscardForDp(hand, slotPile, ["c2"]);
    if (slotPile.length !== 1 || trashPile.length !== 0) {
        fail("applyDiscardForDp no longer fills the destination pile it is given");
    }
}

// ---------------------------------------------------------------------------
// G5 — docs/2.3 §2B is the equal-speed fallback, not the primary key
// ---------------------------------------------------------------------------

function section2B(text: string): string {
    const lines = text.split(/\r?\n/);
    const start = lines.findIndex(line => /^###\s+\*\*B\.\s*Resolution Priority/.test(line.trim()));
    if (start === -1) return "";
    const rest = lines.slice(start + 1);
    // Stop at the next heading of any level so the checks below cannot be
    // satisfied by prose that lives outside §2B.
    const end = rest.findIndex(line => /^#{1,6}\s/.test(line.trim()));
    return (end === -1 ? rest : rest.slice(0, end)).join("\n");
}

function g5(fail: (msg: string) => void): void {
    const body = section2B(readFileSync(SUPPORT_SPEC, "utf8"));
    if (!body) {
        fail("docs/2.3 has no §2B \"Resolution Priority\" section");
        return;
    }
    // Prose claims span sentences (an emphasised lead-in plus its explanation),
    // so they are judged per paragraph rather than per sentence.
    const blocks = paragraphs(body);

    // 1. The per-card priority is named as the authoritative key.
    if (
        !blocks.some(
            block =>
                /support_speed|supportEffect\.priority/i.test(block) &&
                /authoritative|primary key/i.test(block)
        )
    ) {
        fail(
            "§2B does not name the per-card priority (the canonical support_speed) as the " +
                "authoritative ordering key required by FC-014 / RA-006"
        );
    }

    // 2. The class list is presented as the equal-speed fallback.
    if (
        !blocks.some(
            block => /equal speed/i.test(block) && /fallback|only when|tie/i.test(block)
        )
    ) {
        fail("§2B does not present its class list as the equal-speed fallback");
    }

    // 3. That qualifier precedes the class list, which no longer stands alone.
    const listStart = body.split(/\r?\n/).findIndex(line => /^\s*1\.\s+\*\*Rule Overrides/.test(line));
    if (listStart === -1) {
        fail("§2B no longer contains the numbered class list starting at Rule Overrides");
    } else if (!/equal speed/i.test(body.split(/\r?\n/).slice(0, listStart).join("\n"))) {
        fail("§2B's class list is not preceded by an equal-speed qualifier");
    }

    // 4. The arithmetic known difference is recorded, with both measured values.
    for (const needed of [/1400/, /1100/, /base/i, /mult/i, /flat/i]) {
        if (!needed.test(body)) {
            fail(`§2B does not record the arithmetic known difference (missing ${needed})`);
        }
    }
    if (!/known difference/i.test(body)) {
        fail("§2B does not label the arithmetic divergence a known difference");
    }

    // 5. Runtime: a declared per-card priority outranks the class rank.
    const orderBy = (healPriority?: number, setPriority?: number) => {
        const { active, defender, ctx } = freshContext();
        resolveSupportPhase(
            active,
            defender,
            cardOfPrimitive("heal", "hp_heal", 100, healPriority),
            cardOfPrimitive("set", "enemy_hp_set", 500, setPriority),
            ctx
        );
        return active.hp;
    };
    const classRanked = orderBy();
    const priorityRanked = orderBy(1, 9);
    if (classRanked !== 600) {
        fail(
            `the class-ranked fallback resolved to hp=${classRanked}; the class order ` +
                `(enemy_hp_set rank 3, then hp_heal rank 5) gives 600`
        );
    }
    if (priorityRanked !== 500) {
        fail(
            `the declared per-card priority resolved to hp=${priorityRanked}; 500 is what proves ` +
                `the declared priority, not the class rank, is the primary key`
        );
    }
    const declaredEffect = cardOfPrimitive("x", "atk_mult", 0, 9).supportEffect!;
    const bareEffect = cardOfPrimitive("y", "atk_mult", 0).supportEffect!;
    if (
        effectPriority(declaredEffect) !== 9 ||
        effectClassPriority(bareEffect) !== 3 ||
        effectPriority(bareEffect) !== 3
    ) {
        fail("effectPriority no longer prefers a declared priority over the class rank");
    }

    // 6. Runtime: shipped arithmetic is (base + flat) * mult in either clause
    //    order, and the class-ordered alternative is (base * mult) + flat.
    const damageOf = (text: string) => {
        const { active, ctx } = resolveText(text);
        return getAttackDamageBreakdown(active, "circle", ctx).totalDamage;
    };
    const multThenFlat = "Own Attack Power is doubled. Boost own Attack Power +300.";
    const flatThenMult = "Boost own Attack Power +300. Own Attack Power is doubled.";
    const shipped = damageOf(multThenFlat);
    const shippedReversed = damageOf(flatThenMult);
    const classOrdered = 400 * 2 + 300;
    if (shipped !== 1400 || shippedReversed !== 1400) {
        fail(
            `shipped damage arithmetic measured ${shipped} (mult-then-flat clause order) and ` +
                `${shippedReversed} (reversed); the pinned (base + flat) * mult order gives 1400 ` +
                `for base 400 with x2 and +300 in both orders`
        );
    }
    if (classOrdered !== 1100) {
        fail("the class-ordered alternative no longer measures 1100 on the same inputs");
    }
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const MODES: Record<string, (fail: (msg: string) => void) => void | Promise<void>> = {
    G1: g1,
    G2: g2,
    G3: g3,
    G5: g5,
};

async function main(): Promise<void> {
    const mode = process.argv[2] ?? "";
    if (!Object.prototype.hasOwnProperty.call(MODES, mode)) {
        console.error(
            `doc-truth: unknown mode "${mode}". Expected one of: ${Object.keys(MODES).join(", ")}`
        );
        process.exit(2);
    }

    const failures: string[] = [];
    await MODES[mode]!(message => failures.push(message));

    if (failures.length > 0) {
        console.error(`doc-truth ${mode} FAILED (${failures.length}):`);
        for (const failure of failures) console.error(`  - ${failure}`);
        process.exit(1);
    }
    console.log(`doc-truth ${mode} verified`);
}

main().then(
    () => process.exit(0),
    error => {
        console.error(`doc-truth: unexpected error: ${error?.stack ?? error}`);
        process.exit(1);
    }
);
