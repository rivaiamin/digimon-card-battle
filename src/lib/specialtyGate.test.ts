import { describe, expect, it } from "vitest";

import cardsData from "../data/cards.json";
import { CardSchema, PlayerSchema, SupportEffectSchema } from "../schema/BattleState";
import { loadCardCatalog, type NormalizedCardCatalogEntry } from "./cardCatalogLoader";
import { parseCondition, splitConditional } from "./effectCondition";
import { normalizeSpecialtyLabel } from "./effectTextNormalize";
import {
    canVoidEnemySupport,
    createSupportBattleContext,
    evaluateSupportNullification,
    resolveSupportPhase,
} from "./supportResolver";

/**
 * Regression for the specialty gates dropped in 7657c41.
 *
 * That commit regenerated `src/data/cards.json` from `buildCardCatalog.ts`, whose
 * void branch returns `{ type: "void_enemy_support" }` with no gate. Card 036
 * (MetalSeadramon) lost `requireType:"Ice"` and card 152 (Starmon) lost
 * `requireOpponentType:"Dark"` while both KEPT their gating text, so each voided
 * unconditionally. The catalog generator cannot be re-run on a fresh clone (its
 * inputs are git-ignored and absent), so the artifact is edited by hand and these
 * tests are what keep the hand edit honest.
 *
 * @see docs/fidelity-rules-contract.md FC-015
 */

const CATALOG = loadCardCatalog(cardsData as unknown[]);
const CATALOG_BY_ID = new Map(CATALOG.map(c => [c.id, c]));

function catalogCard(id: string): NormalizedCardCatalogEntry {
    const card = CATALOG_BY_ID.get(id);
    if (!card) throw new Error(`catalog card ${id} is missing`);
    return card;
}

function makePlayer(sessionId: string, specialty: string): PlayerSchema {
    const player = new PlayerSchema();
    player.sessionId = sessionId;
    player.hp = 2000;
    const active = new CardSchema();
    active.id = `${sessionId}-active`;
    active.cardKind = "digimon";
    active.type = specialty;
    active.maxHp = 2000;
    active.hp = 2000;
    active.circle.damage = 400;
    active.triangle.damage = 300;
    active.cross.damage = 200;
    player.active = active;
    return player;
}

function plainSupport(id: string): CardSchema {
    const card = new CardSchema();
    card.id = id;
    card.cardKind = "digimon";
    const se = new SupportEffectSchema();
    se.type = "atk_buff";
    se.targetAttack = "all";
    se.value = 500;
    se.description = "Boost own Attack Power +500.";
    card.supportEffect = se;
    return card;
}

/** Rebuild a schema card from the loaded catalog entry, as the room does at start. */
function schemaSupport(entry: NormalizedCardCatalogEntry, instanceId: string): CardSchema {
    const card = new CardSchema();
    card.id = instanceId;
    card.cardKind = entry.cardKind;
    card.type = entry.type;
    const effect = entry.supportEffect;
    if (effect) {
        const se = new SupportEffectSchema();
        se.type = effect.type;
        se.targetAttack = effect.targetAttack;
        se.value = effect.value;
        se.description = effect.description;
        se.requireType = effect.requireType;
        se.requireOpponentType = effect.requireOpponentType;
        se.priority = effect.priority;
        card.supportEffect = se;
    }
    return card;
}

/** True when the card, played as support by `ownerType`, voids `opponentType`'s support. */
function voids(entry: NormalizedCardCatalogEntry, ownerType: string, opponentType: string): boolean {
    return evaluateSupportNullification(
        makePlayer("owner", ownerType),
        makePlayer("opponent", opponentType),
        schemaSupport(entry, "owner-support"),
        plainSupport("opponent-support")
    ).defenderVoided;
}

describe("catalog specialty gates (FC-015 regression, 7657c41)", () => {
    it("keeps the gate fields on the cards whose text demands them", () => {
        // These are the two gates 7657c41 dropped. The counts are exact: if a
        // future regeneration drops a gate the text still requires, this fails.
        expect(catalogCard("036").supportEffect?.requireType).toBe("Ice");
        expect(catalogCard("152").supportEffect?.requireOpponentType).toBe("Dark");
        // Card 008's gate survived the same commit; it is the in-catalog control
        // that proves the assertion above is not vacuous.
        expect(catalogCard("008").supportEffect?.requireType).toBe("Fire");
    });

    it("does not void off-specialty for an own-specialty gate (036 MetalSeadramon)", () => {
        const card = catalogCard("036");

        // A Fire owner holding 036 must not void a Fire opponent's support.
        expect(voids(card, "Fire", "Fire")).toBe(false);
        expect(voids(card, "Nature", "Nature")).toBe(false);
        // Positive control: the same probe observes a void when the gate holds.
        expect(voids(card, "Ice", "Fire")).toBe(true);
    });

    it("does not void off-specialty for an opponent-specialty gate (152 Starmon)", () => {
        const card = catalogCard("152");

        expect(voids(card, "Fire", "Fire")).toBe(false);
        expect(voids(card, "Rare", "Nature")).toBe(false);
        // Positive control.
        expect(voids(card, "Fire", "Dark")).toBe(true);
    });

    it("still voids unconditionally for a card whose text has no gate (043)", () => {
        const card = catalogCard("043");
        expect(card.supportEffect?.requireType).toBe("");
        expect(card.supportEffect?.requireOpponentType).toBe("");
        expect(voids(card, "Fire", "Fire")).toBe(true);
    });

    it("survives the full support resolution: an off-specialty void leaves support intact", () => {
        const owner = makePlayer("owner", "Fire");
        const opponent = makePlayer("opponent", "Fire");
        const ownerSupport = schemaSupport(catalogCard("036"), "owner-support");
        const opponentSupport = plainSupport("opponent-support");
        opponent.supportCard = opponentSupport;

        const result = resolveSupportPhase(
            owner,
            opponent,
            ownerSupport,
            opponentSupport,
            createSupportBattleContext(),
            { activeSessionId: "owner", sessionOrder: ["owner", "opponent"] },
            undefined,
            { activeAttack: "circle", defenderAttack: "circle" }
        );

        expect(result.defenderVoided).toBe(false);
        expect(opponent.supportCard).not.toBeNull();
    });

    it("lets canVoidEnemySupport read the gate fields the loader produced", () => {
        const effect = catalogCard("152").supportEffect!;
        expect(
            canVoidEnemySupport(makePlayer("o", "Fire"), effect, makePlayer("d", "Dark"), true)
        ).toBe(true);
        expect(
            canVoidEnemySupport(makePlayer("o", "Fire"), effect, makePlayer("d", "Fire"), true)
        ).toBe(false);
    });

    it("gates every specialty condition the text names and the runtime does not re-parse", () => {
        // Structural guard: driven from card text via the runtime's own condition
        // parser, never a hand-written list. `conditional` / `compose` cards
        // re-parse their description at resolution time and are exempt.
        const violations: string[] = [];
        for (const entry of CATALOG) {
            const effect = entry.supportEffect;
            if (!effect?.description) continue;
            if (effect.type === "conditional" || effect.type === "compose") continue;

            const split = splitConditional(effect.description);
            const condition = split ? parseCondition(split.head) : null;
            if (!condition) continue;

            if (condition.kind === "own_specialty_is") {
                if (normalizeSpecialtyLabel(effect.requireType) !== normalizeSpecialtyLabel(condition.specialty)) {
                    violations.push(
                        `${entry.id}: text requires requireType:"${condition.specialty}", field is "${effect.requireType}"`
                    );
                }
            } else if (condition.kind === "opponent_specialty_is") {
                if (
                    normalizeSpecialtyLabel(effect.requireOpponentType) !==
                    normalizeSpecialtyLabel(condition.specialty)
                ) {
                    violations.push(
                        `${entry.id}: text requires requireOpponentType:"${condition.specialty}", field is "${effect.requireOpponentType}"`
                    );
                }
            } else if (
                condition.kind === "opponent_specialty_in" ||
                condition.kind === "opponent_specialty_not"
            ) {
                // No single gate field expresses an OR / NOT, and a primitive
                // path ignores the text — this is an unresolved condition.
                violations.push(`${entry.id}: ${condition.kind} cannot be expressed by a gate field`);
            }
        }

        expect(violations).toEqual([]);
    });

    it("parses the specialty condition text it is asserted against", () => {
        // Control for the structural guard: a broken parser would find no
        // conditions and read as a valid absence.
        expect(parseCondition(splitConditional("If own Specialty is Fire, boost own Attack Power +300.")!.head)).toEqual({
            kind: "own_specialty_is",
            specialty: "Fire",
        });
        expect(
            parseCondition(
                splitConditional("If opponent's Specialty is Darkness, opponent's Support Effect is voided.")!.head
            )
        ).toEqual({ kind: "opponent_specialty_is", specialty: "Darkness" });
        expect(splitConditional("Opponent's Support Effect is voided.")).toBeNull();
    });
});
