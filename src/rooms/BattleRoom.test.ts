import { afterEach, describe, expect, it } from "vitest";
import type { AttackType } from "../types";

import cardsData from "../data/cards.json";
import { loadCardCatalog, type NormalizedCardCatalogEntry } from "../lib/cardCatalogLoader";
import type { SupportBattleContext } from "../lib/supportResolver";
import { BattleRoom } from "./BattleRoom";
import { CardSchema, PlayerSchema, SupportEffectSchema } from "../schema/BattleState";

const catalog = loadCardCatalog(cardsData);
const recoveryOption = catalog.find(card => card.id === "266");
if (!recoveryOption) throw new Error("Recovery Floppy card 266 missing from catalog");

function catalogCard(id: string): NormalizedCardCatalogEntry {
    const found = catalog.find(card => card.id === id);
    if (!found) throw new Error(`Card ${id} missing from catalog`);
    return found;
}

type TestRoom = {
    onCreate(options: Record<string, unknown>): void;
    clearPhaseTimer(): void;
    toSchemaCard(raw: NormalizedCardCatalogEntry, instanceId: string): CardSchema;
    finishSupportRevealAndAdvance(): void;
    finishBattleEffectsAndAdvance(): void;
    maybeResolveBattle(): void;
    state: {
        players: { set(sessionId: string, player: PlayerSchema): void };
        activePlayerSessionId: string;
        phase: string;
        combatStrikesJson: string;
    };
    attackChoices: Map<string, AttackType | null>;
    revealTimer: { clear(): void } | null;
    supportCtx: SupportBattleContext;
    effectsTimer: { clear(): void } | null;
    resolutionTimer: { clear(): void } | null;
};

function makePlayer(sessionId: string, hp: number, maxHp = 1000): PlayerSchema {
    const player = new PlayerSchema();
    player.sessionId = sessionId;
    player.hp = hp;

    const active = new CardSchema();
    active.id = `${sessionId}-active`;
    active.cardKind = "digimon";
    active.hp = hp;
    active.maxHp = maxHp;
    player.active = active;
    return player;
}

function makeRoom(players: PlayerSchema[], activePlayerSessionId: string): TestRoom {
    const room = new BattleRoom() as unknown as TestRoom;
    room.onCreate({});
    for (const player of players) room.state.players.set(player.sessionId, player);
    room.state.activePlayerSessionId = activePlayerSessionId;
    return room;
}
function resolveSupportAndCombat(
    room: TestRoom,
    active: PlayerSchema,
    defender: PlayerSchema,
    activeAttack: AttackType,
    defenderAttack: AttackType
): void {
    active.attackLocked = true;
    defender.attackLocked = true;
    room.attackChoices.set(active.sessionId, activeAttack);
    room.attackChoices.set(defender.sessionId, defenderAttack);
    room.finishSupportRevealAndAdvance();
    if (room.state.phase === "battle_effects") room.finishBattleEffectsAndAdvance();
}

function clearRoomTimers(room: TestRoom): void {
    room.clearPhaseTimer();
    room.revealTimer?.clear();
    room.effectsTimer?.clear();
    room.resolutionTimer?.clear();
}

describe("BattleRoom HP synchronization", () => {
    let room: TestRoom | undefined;

    afterEach(() => {
        if (room) clearRoomTimers(room);
        room = undefined;
    });

    it("applies an Option recovery to the active Digimon's current HP", () => {
        const player = makePlayer("player", 570);
        const opponent = makePlayer("opponent", 500);
        const option = new CardSchema();
        option.id = recoveryOption.id;
        option.name = recoveryOption.name;
        option.cardKind = recoveryOption.cardKind;
        option.effectId = recoveryOption.effectId;
        option.effectArgsJson = JSON.stringify(recoveryOption.effectArgs);
        player.supportCard = option;
        room = makeRoom([player, opponent], player.sessionId);

        room.finishSupportRevealAndAdvance();

        expect(player.hp).toBe(870);
        expect(player.active?.hp).toBe(870);
    });

    it("applies a Digimon support recovery to the active Digimon's current HP", () => {
        const player = makePlayer("player", 570);
        const opponent = makePlayer("opponent", 500);
        const support = new CardSchema();
        support.id = "recovery-digimon";
        support.cardKind = "digimon";
        const effect = new SupportEffectSchema();
        effect.type = "hp_heal";
        effect.value = 300;
        support.supportEffect = effect;
        player.supportCard = support;
        room = makeRoom([player, opponent], player.sessionId);

        room.finishSupportRevealAndAdvance();

        expect(player.hp).toBe(870);
        expect(player.active?.hp).toBe(870);
    });

    it("resolves a catalog Option effect plan after BattleRoom schema conversion", () => {
        const player = makePlayer("player", 500);
        const opponent = makePlayer("opponent", 500);
        player.active!.type = "Fire";
        player.supportCard = null;
        room = makeRoom([player, opponent], player.sessionId);
        const option = room.toSchemaCard(catalogCard("245"), "option-245");
        option.supportEffect!.description = "This legacy description is deliberately not parseable.";
        player.supportCard = option;
        room.attackChoices.set(player.sessionId, "circle");
        room.attackChoices.set(opponent.sessionId, "triangle");

        room.finishSupportRevealAndAdvance();

        expect(room.supportCtx.attackMultiplier.get(player.sessionId)).toEqual({
            circle: 2,
            triangle: 2,
            cross: 2,
        });
    });

    it("resolves a catalog Digimon effect plan after BattleRoom schema conversion", () => {
        const player = makePlayer("player", 500);
        const opponent = makePlayer("opponent", 500);
        player.active!.type = "Fire";
        room = makeRoom([player, opponent], player.sessionId);
        const support = room.toSchemaCard(catalogCard("004"), "digimon-004");
        support.supportEffect!.description = "This legacy description is deliberately not parseable.";
        player.supportCard = support;

        room.finishSupportRevealAndAdvance();

        expect(room.supportCtx.attackBonus.get(player.sessionId)).toEqual({
            circle: 300,
            triangle: 300,
            cross: 300,
        });
    });

    it("resolves every clause in a catalog compose plan", () => {
        const player = makePlayer("player", 1000);
        const opponent = makePlayer("opponent", 1000);
        player.active!.type = "Ice";
        player.active!.circle.damage = 100;
        opponent.active!.type = "Dark";
        opponent.active!.cross.damage = 0;
        room = makeRoom([player, opponent], player.sessionId);
        player.supportCard = room.toSchemaCard(catalogCard("001"), "support-001");

        resolveSupportAndCombat(room, player, opponent, "circle", "cross");

        const strikes = JSON.parse(room.state.combatStrikesJson) as Array<{
            attackerSessionId: string;
            baseDamage: number;
            bonusDamage: number;
            totalDamage: number;
        }>;
        expect(player.active!.type).toBe("Fire");
        expect(
            strikes.find(strike => strike.attackerSessionId === player.sessionId)
        ).toMatchObject({ baseDamage: 100, bonusDamage: 100, totalDamage: 200 });
    });

    it("applies additive and multiplier Option plans to exact strike damage", () => {
        const run = (optionId: string) => {
            const player = makePlayer("player", 1000);
            const opponent = makePlayer("opponent", 1000);
            player.active!.circle.damage = 100;
            opponent.active!.cross.damage = 0;
            room = makeRoom([player, opponent], player.sessionId);
            player.supportCard = room.toSchemaCard(catalogCard(optionId), `option-${optionId}`);

            resolveSupportAndCombat(room, player, opponent, "circle", "cross");

            const strikes = JSON.parse(room.state.combatStrikesJson) as Array<{
                attackerSessionId: string;
                attack: AttackType;
                baseDamage: number;
                totalDamage: number;
            }>;
            const strike = strikes.find(s => s.attackerSessionId === player.sessionId);
            const result = {
                opponentHp: opponent.hp,
                strike: strike
                    ? {
                          attackerSessionId: strike.attackerSessionId,
                          attack: strike.attack,
                          baseDamage: strike.baseDamage,
                          totalDamage: strike.totalDamage,
                      }
                    : undefined,
            };
            clearRoomTimers(room);
            return result;
        };

        const additive = run("264");
        expect(additive).toEqual({
            opponentHp: 600,
            strike: { attackerSessionId: "player", attack: "circle", baseDamage: 100, totalDamage: 400 },
        });
        const multiplier = run("267");
        expect(multiplier).toEqual({
            opponentHp: 800,
            strike: { attackerSessionId: "player", attack: "circle", baseDamage: 100, totalDamage: 200 },
        });
    });

    it("zeros only the selected opponent attack slot, with an unselected-slot control", () => {
        const run = (attack: AttackType) => {
            const player = makePlayer("player", 1000);
            const opponent = makePlayer("opponent", 1000);
            player.active!.circle.damage = 0;
            opponent.active!.circle.damage = 300;
            opponent.active!.cross.damage = 300;
            room = makeRoom([player, opponent], player.sessionId);
            player.supportCard = room.toSchemaCard(catalogCard("270"), "option-270");

            resolveSupportAndCombat(room, player, opponent, "circle", attack);
            const hp = player.hp;
            clearRoomTimers(room);
            return hp;
        };

        expect(run("circle")).toBe(1000);
        expect(run("cross")).toBe(700);
    });

    it("applies a conditional Option plan only at its level gate", () => {
        const run = (opponentLevel: string) => {
            const player = makePlayer("player", 1000);
            const opponent = makePlayer("opponent", 1000);
            player.active!.circle.damage = 100;
            opponent.active!.cross.damage = 300;
            opponent.active!.level = opponentLevel;
            room = makeRoom([player, opponent], player.sessionId);
            player.supportCard = room.toSchemaCard(catalogCard("234"), "option-234");

            resolveSupportAndCombat(room, player, opponent, "circle", "cross");
            const strikes = JSON.parse(room.state.combatStrikesJson) as Array<{
                attackerSessionId: string;
                totalDamage: number;
            }>;
            const result = {
                playerHp: player.hp,
                opponentHp: opponent.hp,
                playerDamage: strikes.find(s => s.attackerSessionId === player.sessionId)?.totalDamage,
                opponentStrike: strikes.some(s => s.attackerSessionId === opponent.sessionId),
            };
            clearRoomTimers(room);
            return result;
        };

        expect(run("A")).toEqual({
            playerHp: 1000,
            opponentHp: 800,
            playerDamage: 200,
            opponentStrike: false,
        });
        expect(run("C")).toEqual({
            playerHp: 700,
            opponentHp: 900,
            playerDamage: 100,
            opponentStrike: true,
        });
    });

    it("resolves SnowAgumon's Cross-to-zero through attack lock and strike resolution", () => {
        const player = makePlayer("player", 1000);
        const opponent = makePlayer("opponent", 1000);
        room = makeRoom([player, opponent], player.sessionId);
        player.active = room.toSchemaCard(catalogCard("067"), "snowagumon-067");
        player.active.hp = player.hp;
        opponent.active!.cross.damage = 200;

        resolveSupportAndCombat(room, player, opponent, "cross", "cross");

        const strikes = JSON.parse(room.state.combatStrikesJson) as Array<{
            attackerSessionId: string;
            attack: AttackType;
            totalDamage: number;
            canceled?: boolean;
        }>;
        expect(strikes.filter(strike => !strike.canceled)).toEqual([
            expect.objectContaining({
                attackerSessionId: player.sessionId,
                attack: "cross",
                totalDamage: 220,
            }),
        ]);
        expect(opponent.hp).toBe(780);
        expect(player.hp).toBe(1000);
    });

    it("synchronizes Eat-Up HP recovery after a landed strike", () => {
        const player = makePlayer("player", 570);
        const opponent = makePlayer("opponent", 200);
        player.attackLocked = true;
        opponent.attackLocked = true;
        player.active!.cross.damage = 300;
        player.active!.cross.effectId = "cross.eat_up_hp";
        room = makeRoom([player, opponent], player.sessionId);
        room.attackChoices.set(player.sessionId, "cross");
        room.attackChoices.set(opponent.sessionId, "circle");

        room.maybeResolveBattle();

        expect(player.hp).toBe(770);
        expect(player.active?.hp).toBe(770);
    });
});
