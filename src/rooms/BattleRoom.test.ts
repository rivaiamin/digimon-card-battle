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
    maybeResolveBattle(): void;
    state: {
        players: { set(sessionId: string, player: PlayerSchema): void };
        activePlayerSessionId: string;
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
