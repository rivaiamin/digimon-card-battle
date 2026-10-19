import { afterEach, describe, expect, it } from "vitest";
import type { AttackType } from "../types";

import cardsData from "../data/cards.json";
import { loadCardCatalog } from "../lib/cardCatalogLoader";
import { BattleRoom } from "./BattleRoom";
import { CardSchema, PlayerSchema, SupportEffectSchema } from "../schema/BattleState";

const recoveryOption = loadCardCatalog(cardsData).find(card => card.id === "266");
if (!recoveryOption) throw new Error("Recovery Floppy card 266 missing from catalog");

type TestRoom = {
    onCreate(options: Record<string, unknown>): void;
    clearPhaseTimer(): void;
    finishSupportRevealAndAdvance(): void;
    maybeResolveBattle(): void;
    state: {
        players: { set(sessionId: string, player: PlayerSchema): void };
        activePlayerSessionId: string;
    };
    attackChoices: Map<string, AttackType | null>;
    revealTimer: { clear(): void } | null;
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
