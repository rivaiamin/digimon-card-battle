import { describe, expect, it } from "vitest";
import cardsData from "../data/cards.json";
import { loadCardCatalog } from "./cardCatalogLoader";
import {
    BattleStateSchema,
    PlayerSchema,
    SupportEffectSchema,
    CardSchema,
} from "../schema/BattleState";
import {
    FidelityBattleSession,
    type BattleBandOutcome,
    type PresentationAdvanceResult,
    type RevealCommitResult,
} from "./fidelityBattleSession";
import { SUPPORT_EFFECTS_MS, SUPPORT_REVEAL_MS } from "./battleTurnFlow";
import { resolveRuleProfile, type RuleProfileId } from "./ruleProfile";
import { resolveArenaVariant } from "./arenaVariant";
import { getDefenderSessionId } from "./supportPhase";

const catalog = loadCardCatalog(cardsData);
const catalogById = new Map(catalog.map(c => [c.id, c]));

function battleReadyPlayer(sessionId: string, hp = 1000): PlayerSchema {
    const player = new PlayerSchema();
    player.sessionId = sessionId;
    player.hp = hp;
    const active = new CardSchema();
    active.cardKind = "digimon";
    active.hp = hp;
    active.maxHp = hp;
    active.circle.damage = 100;
    active.triangle.damage = 100;
    active.cross.damage = 100;
    player.active = active;
    return player;
}

function isBattleBandOutcome(value: unknown): value is BattleBandOutcome {
    if (!value || typeof value !== "object" || !("kind" in value)) return false;
    const kind = (value as BattleBandOutcome).kind;
    return kind === "turn_complete" || kind === "match_end" || kind === "deck_out" || kind === "ko_redeploy";
}

/** Mirrors {@link BattleRoom.applyPresentationAdvance} without Colyseus clocks. */
function drainPresentation(
    session: FidelityBattleSession,
    step: PresentationAdvanceResult
): BattleBandOutcome | undefined {
    let current: PresentationAdvanceResult | undefined = step;
    while (current) {
        switch (current.kind) {
            case "idle":
                return undefined;
            case "sync_timer":
                return undefined;
            case "schedule_reveal":
                expect(current.ms).toBe(SUPPORT_REVEAL_MS);
                current = continueFromReveal(session, session.finishSupportRevealAndAdvance());
                break;
            case "schedule_effects":
                expect(current.ms).toBe(SUPPORT_EFFECTS_MS);
                current = session.finishBattleEffectsAndAdvance();
                break;
            case "schedule_resolution":
                expect(session.legalityContext("p1").phase).toBe("resolution");
                expect(current.ms).toBe(0);
                return session.completeResolutionPresentation();
            case "outcome":
                return current.outcome;
            default:
                return undefined;
        }
        if (current && isBattleBandOutcome(current)) {
            return current;
        }
    }
    return undefined;
}

function continueFromReveal(
    session: FidelityBattleSession,
    result: RevealCommitResult
): PresentationAdvanceResult | undefined {
    if (result.kind === "schedule_effects") {
        return { kind: "schedule_effects", ms: result.ms };
    }
    return result.presentation;
}

function lockEmptySupports(
    session: FidelityBattleSession,
    activeId: string,
    players: PlayerSchema[],
    defenderFirst: boolean
): PresentationAdvanceResult | undefined {
    const sessionIds = players.map(p => p.sessionId);
    if (defenderFirst) {
        const defender = getDefenderSessionId(activeId, sessionIds);
        session.dispatch(defender, "LOCK_SUPPORT", { cardId: null });
        const activeLock = session.dispatch(activeId, "LOCK_SUPPORT", { cardId: null });
        return activeLock.ok ? activeLock.presentation : undefined;
    }
    let presentation: PresentationAdvanceResult | undefined;
    for (const id of sessionIds) {
        const locked = session.dispatch(id, "LOCK_SUPPORT", { cardId: null });
        if (locked.ok && locked.presentation) presentation = locked.presentation;
    }
    return presentation;
}

function makeSession(
    players: PlayerSchema[],
    activeId: string,
    phase = "battle_attack",
    prepSubPhase = "",
    getRng: () => number = Math.random,
    profileId: RuleProfileId = "fidelity_ps1"
): FidelityBattleSession {
    const state = new BattleStateSchema();
    state.phase = phase;
    state.prepSubPhase = prepSubPhase;
    state.activePlayerSessionId = activeId;
    for (const p of players) state.players.set(p.sessionId, p);
    return new FidelityBattleSession(
        {
            state,
            ruleProfile: resolveRuleProfile(profileId),
            arenaVariant: resolveArenaVariant("standard"),
            catalogById,
            getRng: () => getRng,
        },
        {
            emitAudit: () => {},
            auditPlayer: () => {},
            syncPhaseTimer: () => {},
            clearPhaseTimer: () => {},
            prepMessageFor: () => "deploy",
            shuffleInPlace: () => {},
            endGame: () => {},
            endPrepOrPassTurn: () => {},
        }
    );
}

describe("FidelityBattleSession", () => {
    it("rejects LOCK_ATTACK outside battle_attack", () => {
        const player = new PlayerSchema();
        player.sessionId = "p1";
        const opponent = new PlayerSchema();
        opponent.sessionId = "p2";
        const session = makeSession([player, opponent], "p1", "battle_reveal");
        const result = session.dispatch("p1", "LOCK_ATTACK", { attack: "circle" });
        expect(result).toEqual({ ok: false, reason: "illegal_timing" });
    });

    it("accepts LOCK_ATTACK during battle_attack", () => {
        const player = new PlayerSchema();
        player.sessionId = "p1";
        player.active = new CardSchema();
        const opponent = new PlayerSchema();
        opponent.sessionId = "p2";
        opponent.active = new CardSchema();
        const session = makeSession([player, opponent], "p1", "battle_attack");
        const result = session.dispatch("p1", "LOCK_ATTACK", { attack: "circle" });
        expect(result).toEqual({ ok: true });
        expect(player.attackLocked).toBe(true);
        expect(session.attackChoices.get("p1")).toBe("circle");
    });

    it("evolves with DP cost through the session seam", () => {
        const player = new PlayerSchema();
        player.sessionId = "p1";
        player.dp = 500;
        const active = new CardSchema();
        active.cardKind = "digimon";
        active.level = "Rookie";
        active.maxHp = 500;
        active.hp = 500;
        player.active = active;
        const target = new CardSchema();
        target.id = "evo-target";
        target.cardKind = "digimon";
        target.level = "Champion";
        target.evoCost = 200;
        target.maxHp = 1000;
        player.hand.push(target);

        const state = new BattleStateSchema();
        state.phase = "preparation";
        state.prepSubPhase = "evolve";
        state.activePlayerSessionId = "p1";
        state.players.set(player.sessionId, player);
        const session = new FidelityBattleSession(
            {
                state,
                ruleProfile: resolveRuleProfile("fidelity_ps1"),
                arenaVariant: resolveArenaVariant("standard"),
                catalogById,
                getRng: () => Math.random,
            },
            {
                emitAudit: () => {},
                auditPlayer: () => {},
                syncPhaseTimer: () => {},
                clearPhaseTimer: () => {},
                prepMessageFor: () => "",
                shuffleInPlace: () => {},
                endGame: () => {},
                endPrepOrPassTurn: () => {},
            }
        );
        expect(session.evolve(player, target.id)).toBe(true);
        expect(player.dp).toBe(300);
        expect(player.active?.id).toBe("evo-target");
    });

    it("accepts hand through dispatch during mulligan", () => {
        const player = new PlayerSchema();
        player.sessionId = "p1";
        const state = new BattleStateSchema();
        state.phase = "preparation";
        state.prepSubPhase = "mulligan";
        state.activePlayerSessionId = "p1";
        state.players.set(player.sessionId, player);
        const session = makeSession([player], "p1", "preparation", "mulligan");
        const result = session.dispatch("p1", "ACCEPT_HAND");
        expect(result).toEqual({ ok: true });
        expect(session.legalityContext("p1").prepSubPhase).toBe("deploy");
    });

    it("transitions draw to preparation through executeDrawPhase", () => {
        const player = new PlayerSchema();
        player.sessionId = "p1";
        for (let i = 0; i < 4; i++) {
            const c = new CardSchema();
            c.id = `h${i}`;
            c.cardKind = "digimon";
            player.hand.push(c);
        }
        const session = makeSession([player], "p1", "draw");
        session.executeDrawPhase(player, false);
        expect(session.legalityContext("p1").phase).toBe("preparation");
    });

    it("schedules reveal presentation after both supports lock", () => {
        const player = new PlayerSchema();
        player.sessionId = "p1";
        player.active = new CardSchema();
        const opponent = new PlayerSchema();
        opponent.sessionId = "p2";
        opponent.active = new CardSchema();
        const session = makeSession([player, opponent], "p1", "battle_support");
        session.beginSupportPlacement();
        const defenderFirst = session.dispatch("p2", "LOCK_SUPPORT", { cardId: null });
        expect(defenderFirst.ok).toBe(true);
        const activeSecond = session.dispatch("p1", "LOCK_SUPPORT", { cardId: null });
        expect(activeSecond.ok).toBe(true);
        if (activeSecond.ok) {
            expect(activeSecond.presentation).toEqual({ kind: "schedule_reveal", ms: 2200 });
        }
    });

    it("auto-accepts hand on prep_mulligan timeout", () => {
        const player = new PlayerSchema();
        player.sessionId = "p1";
        const session = makeSession([player], "p1", "preparation", "mulligan");
        const audits: string[] = [];
        session.handlePhaseTimeout("prep_mulligan", {
            auditTimeout: (_ids, autoCommit) => {
                audits.push(autoCommit);
            },
            applyStrike: () => false,
        });
        expect(audits).toEqual(["auto_accept_hand"]);
        expect(session.legalityContext("p1").prepSubPhase).toBe("deploy");
    });

    it("skips timeout auto-commit when PhaseTimeoutPort applies a strike", () => {
        const player = new PlayerSchema();
        player.sessionId = "p1";
        const session = makeSession([player], "p1", "preparation", "mulligan");
        const audits: string[] = [];
        session.handlePhaseTimeout("prep_mulligan", {
            auditTimeout: (_ids, autoCommit) => {
                audits.push(autoCommit);
            },
            applyStrike: () => true,
        });
        expect(audits).toEqual(["auto_accept_hand"]);
        expect(session.legalityContext("p1").prepSubPhase).toBe("mulligan");
    });

    it("auto-draws on draw phase timeout", () => {
        const player = new PlayerSchema();
        player.sessionId = "p1";
        for (let i = 0; i < 4; i++) {
            const c = new CardSchema();
            c.id = `h${i}`;
            c.cardKind = "digimon";
            player.hand.push(c);
        }
        const session = makeSession([player], "p1", "draw");
        const audits: string[] = [];
        session.handlePhaseTimeout("draw", {
            auditTimeout: (_ids, autoCommit) => {
                audits.push(autoCommit);
            },
            applyStrike: () => false,
        });
        expect(audits).toEqual(["auto_draw"]);
        expect(session.legalityContext("p1").phase).toBe("preparation");
    });

    it("auto-locks random attacks on battle_attack timeout", () => {
        const player = new PlayerSchema();
        player.sessionId = "p1";
        player.active = new CardSchema();
        const opponent = new PlayerSchema();
        opponent.sessionId = "p2";
        opponent.active = new CardSchema();
        const session = makeSession([player, opponent], "p1", "battle_attack", "", () => 0);
        const audits: string[] = [];
        session.handlePhaseTimeout("battle_attack", {
            auditTimeout: (_ids, autoCommit) => {
                audits.push(autoCommit);
            },
            applyStrike: () => false,
        });
        expect(audits).toEqual(["auto_random_attack", "auto_random_attack"]);
        expect(player.attackLocked).toBe(true);
        expect(opponent.attackLocked).toBe(true);
        expect(session.attackChoices.get("p1")).toBe("circle");
        expect(session.attackChoices.get("p2")).toBe("circle");
        expect(session.legalityContext("p1").phase).toBe("battle_support");
    });

    it("auto-locks empty support on battle_support timeout (defender-first pick)", () => {
        const player = new PlayerSchema();
        player.sessionId = "p1";
        player.active = new CardSchema();
        const opponent = new PlayerSchema();
        opponent.sessionId = "p2";
        opponent.active = new CardSchema();
        const session = makeSession([player, opponent], "p1", "battle_support");
        session.beginSupportPlacement();
        const audits: string[] = [];
        const port = {
            auditTimeout: (_ids: string[], autoCommit: string) => {
                audits.push(autoCommit);
            },
            applyStrike: () => false,
        };
        const first = session.handlePhaseTimeout("battle_support", port);
        expect(audits).toEqual(["auto_no_support"]);
        expect(opponent.supportLocked).toBe(true);
        expect(player.supportLocked).toBe(false);
        expect(first.presentation).toEqual({ kind: "idle" });

        const second = session.handlePhaseTimeout("battle_support", port);
        expect(audits).toEqual(["auto_no_support", "auto_no_support"]);
        expect(player.supportLocked).toBe(true);
        expect(second.presentation).toEqual({ kind: "schedule_reveal", ms: 2200 });
    });

    it("syncs active HP after support reveal", () => {
        const player = new PlayerSchema();
        player.sessionId = "p1";
        player.hp = 570;
        const active = new CardSchema();
        active.hp = 570;
        active.maxHp = 1000;
        player.active = active;
        const support = new CardSchema();
        support.cardKind = "digimon";
        const effect = new SupportEffectSchema();
        effect.type = "hp_heal";
        effect.value = 300;
        support.supportEffect = effect;
        player.supportCard = support;

        const opponent = new PlayerSchema();
        opponent.sessionId = "p2";
        opponent.hp = 500;
        opponent.active = new CardSchema();

        const session = makeSession([player, opponent], "p1", "battle_reveal");
        session.finishSupportRevealAndAdvance();
        expect(player.hp).toBe(870);
        expect(player.active?.hp).toBe(870);
    });
});

describe("FidelityBattleSession presentation invariants", () => {
    it("attack-first (PS1): reveal → resolution → turn_complete when supports are empty", () => {
        const player = battleReadyPlayer("p1");
        const opponent = battleReadyPlayer("p2");
        const session = makeSession([player, opponent], "p1", "draw", "", Math.random, "fidelity_ps1");
        session.enterBattlePhase();
        expect(session.legalityContext("p1").phase).toBe("battle_attack");

        session.dispatch("p1", "LOCK_ATTACK", { attack: "circle" });
        session.dispatch("p2", "LOCK_ATTACK", { attack: "circle" });
        expect(session.legalityContext("p1").phase).toBe("battle_support");

        const revealStep = lockEmptySupports(session, "p1", [player, opponent], true);
        expect(revealStep).toEqual({ kind: "schedule_reveal", ms: SUPPORT_REVEAL_MS });
        expect(session.legalityContext("p1").phase).toBe("battle_reveal");

        const reveal = session.finishSupportRevealAndAdvance();
        expect(reveal).toEqual({
            kind: "immediate_effects_done",
            presentation: { kind: "schedule_resolution", ms: 0 },
        });

        expect(reveal.kind).toBe("immediate_effects_done");
        if (reveal.kind !== "immediate_effects_done" || !reveal.presentation) {
            throw new Error("expected reveal to forward resolution presentation");
        }
        const outcome = drainPresentation(session, reveal.presentation);
        expect(outcome).toEqual({ kind: "turn_complete" });
        expect(session.legalityContext("p1").phase).toBe("resolution");
    });

    it("support-first (legacy): reveal → attack lock → resolution → turn_complete", () => {
        const player = battleReadyPlayer("p1");
        const opponent = battleReadyPlayer("p2");
        const session = makeSession([player, opponent], "p1", "draw", "", Math.random, "legacy_online");
        session.enterBattlePhase();
        expect(session.legalityContext("p1").phase).toBe("battle_support");

        const revealStep = lockEmptySupports(session, "p1", [player, opponent], false);
        expect(revealStep).toEqual({ kind: "schedule_reveal", ms: SUPPORT_REVEAL_MS });

        const afterReveal = session.finishSupportRevealAndAdvance();
        expect(afterReveal).toEqual({
            kind: "immediate_effects_done",
            presentation: { kind: "sync_timer" },
        });
        expect(session.legalityContext("p1").phase).toBe("battle_attack");

        session.dispatch("p1", "LOCK_ATTACK", { attack: "circle" });
        const finish = session.dispatch("p2", "LOCK_ATTACK", { attack: "circle" });
        expect(finish).toMatchObject({
            ok: true,
            presentation: { kind: "schedule_resolution", ms: 0 },
        });

        if (!finish.ok || !finish.presentation) {
            throw new Error("expected attack locks to schedule resolution");
        }
        const outcome = drainPresentation(session, finish.presentation);
        expect(outcome).toEqual({ kind: "turn_complete" });
    });

    it("attack-first: schedule_effects step advances to resolution after finishBattleEffectsAndAdvance", () => {
        const player = battleReadyPlayer("p1");
        const opponent = battleReadyPlayer("p2");
        const session = makeSession(
            [player, opponent],
            "p1",
            "battle_effects",
            "",
            Math.random,
            "fidelity_ps1"
        );
        player.attackLocked = true;
        opponent.attackLocked = true;
        session.attackChoices.set("p1", "circle");
        session.attackChoices.set("p2", "circle");

        const afterEffects = session.finishBattleEffectsAndAdvance();
        expect(afterEffects).toEqual({ kind: "schedule_resolution", ms: 0 });

        const outcome = drainPresentation(session, { kind: "schedule_effects", ms: SUPPORT_EFFECTS_MS });
        expect(outcome).toEqual({ kind: "turn_complete" });
    });

    it("drainPresentation walks schedule_reveal through immediate resolution (attack-first)", () => {
        const player = battleReadyPlayer("p1");
        const opponent = battleReadyPlayer("p2");
        const session = makeSession([player, opponent], "p1", "draw", "", Math.random, "fidelity_ps1");
        session.enterBattlePhase();
        session.dispatch("p1", "LOCK_ATTACK", { attack: "circle" });
        session.dispatch("p2", "LOCK_ATTACK", { attack: "circle" });
        const revealStep = lockEmptySupports(session, "p1", [player, opponent], true);
        expect(revealStep?.kind).toBe("schedule_reveal");

        const outcome = drainPresentation(session, revealStep!);
        expect(outcome).toEqual({ kind: "turn_complete" });
    });
});

describe("FidelityBattleSession match lifecycle", () => {
    it("startMatch shuffles decks and enters draw with coin-flip active player", () => {
        const player = battleReadyPlayer("p1");
        const opponent = battleReadyPlayer("p2");
        const session = makeSession([player, opponent], "p1", "waiting");
        const shuffled: string[] = [];
        const hooks = {
            emitAudit: () => {},
            auditPlayer: () => {},
            syncPhaseTimer: () => {},
            clearPhaseTimer: () => {},
            prepMessageFor: () => "",
            shuffleInPlace: <T>(deck: T[]) => {
                for (const card of deck) {
                    if (card && typeof card === "object" && "id" in card && typeof card.id === "string") {
                        shuffled.push(card.id);
                    }
                }
            },
            endGame: () => {},
            endPrepOrPassTurn: () => {},
        };
        const state = new BattleStateSchema();
        state.phase = "waiting";
        state.activePlayerSessionId = "p1";
        state.players.set(player.sessionId, player);
        state.players.set(opponent.sessionId, opponent);
        const seeded = new FidelityBattleSession(
            {
                state,
                ruleProfile: resolveRuleProfile("fidelity_ps1"),
                arenaVariant: resolveArenaVariant("standard"),
                catalogById,
                getRng: () => () => 0,
            },
            hooks
        );

        seeded.startMatch({
            sessionIds: ["p1", "p2"],
            deckCardIdsBySession: new Map([
                ["p1", ["027"]],
                ["p2", ["028"]],
            ]),
            fallbackDeckCardIds: () => ["027"],
            materializeDeck: (_index, ids) =>
                ids.map((id, i) => {
                    const c = new CardSchema();
                    c.id = `deck-${id}-${i}`;
                    c.cardKind = "digimon";
                    return c;
                }),
        });

        expect(seeded.legalityContext("p1").phase).toBe("draw");
        expect(state.turn).toBe(1);
        expect(state.activePlayerSessionId).toBe("p1");
        expect(player.deck.length).toBe(1);
        expect(shuffled.length).toBe(2);
        expect(player.mulligansRemaining).toBeGreaterThanOrEqual(0);
    });

    it("applyMatchEnd records victory and shouldForfeitOnPermanentLeave respects phase", () => {
        const player = battleReadyPlayer("p1");
        const opponent = battleReadyPlayer("p2");
        const session = makeSession([player, opponent], "p1", "draw");
        expect(session.shouldForfeitOnPermanentLeave()).toBe(true);

        const waiting = makeSession([player], "p1", "waiting");
        expect(waiting.shouldForfeitOnPermanentLeave()).toBe(false);

        let cleared = false;
        const state = new BattleStateSchema();
        state.phase = "draw";
        state.players.set(player.sessionId, player);
        state.players.set(opponent.sessionId, opponent);
        const endSession = new FidelityBattleSession(
            {
                state,
                ruleProfile: resolveRuleProfile("fidelity_ps1"),
                arenaVariant: resolveArenaVariant("standard"),
                catalogById,
                getRng: () => Math.random,
            },
            {
                emitAudit: () => {},
                auditPlayer: () => {},
                syncPhaseTimer: () => {},
                clearPhaseTimer: () => {
                    cleared = true;
                },
                prepMessageFor: () => "",
                shuffleInPlace: () => {},
                endGame: () => {},
                endPrepOrPassTurn: () => {},
            }
        );
        endSession.applyMatchEnd("p2", "disconnect");
        expect(cleared).toBe(true);
        expect(state.phase).toBe("victory");
        expect(state.winnerSessionId).toBe("p1");
        expect(state.loserReason).toBe("disconnect");
    });
});
