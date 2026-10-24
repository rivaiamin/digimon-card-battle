import { describe, expect, it } from "vitest";
import cardsData from "../data/cards.json";
import { loadCardCatalog } from "./cardCatalogLoader";
import {
    BattleStateSchema,
    PlayerSchema,
    SupportEffectSchema,
    CardSchema,
} from "../schema/BattleState";
import { FidelityBattleSession } from "./fidelityBattleSession";
import { resolveRuleProfile } from "./ruleProfile";
import { resolveArenaVariant } from "./arenaVariant";

const catalog = loadCardCatalog(cardsData);
const catalogById = new Map(catalog.map(c => [c.id, c]));

function makeSession(
    players: PlayerSchema[],
    activeId: string,
    phase = "battle_attack",
    prepSubPhase = "",
    getRng: () => number = Math.random
): FidelityBattleSession {
    const state = new BattleStateSchema();
    state.phase = phase;
    state.prepSubPhase = prepSubPhase;
    state.activePlayerSessionId = activeId;
    for (const p of players) state.players.set(p.sessionId, p);
    return new FidelityBattleSession(
        {
            state,
            ruleProfile: resolveRuleProfile("fidelity_ps1"),
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
