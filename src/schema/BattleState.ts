import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class AttackSchema extends Schema {
    @type("string") name: string = "";
    @type("number") damage: number = 0;
    @type("string") type: string = ""; // circle, triangle, cross
    @type("string") description: string = "";
}

export class SupportEffectSchema extends Schema {
    @type("string") type: string = ""; // atk_buff | hp_heal | change_attack | halve_hp
    @type("string") targetAttack: string = ""; // circle | triangle | cross | all
    @type("number") value: number = 0;
    @type("string") description: string = "";
}

export class CardSchema extends Schema {
    @type("string") id: string = "";
    @type("string") name: string = "";
    @type("string") level: string = "";
    @type("string") type: string = "";
    @type("number") hp: number = 0;
    @type("number") maxHp: number = 0;
    @type("number") plusDp: number = 0;
    @type("number") evoCost: number = 0;
    @type("string") image: string = "";
    
    @type(AttackSchema) circle = new AttackSchema();
    @type(AttackSchema) triangle = new AttackSchema();
    @type(AttackSchema) cross = new AttackSchema();

    @type(SupportEffectSchema) supportEffect: SupportEffectSchema | null = null;
}

export class PlayerSchema extends Schema {
    @type("string") sessionId: string = "";
    @type("string") name: string = "";
    @type(CardSchema) active: CardSchema | null = null;
    @type([CardSchema]) evolutionStack = new ArraySchema<CardSchema>();
    @type("number") hp: number = 0;
    @type([CardSchema]) hand = new ArraySchema<CardSchema>();
    @type([CardSchema]) deck = new ArraySchema<CardSchema>();
    @type([CardSchema]) trash = new ArraySchema<CardSchema>();
    @type("number") dp: number = 0;
    @type("number") score: number = 0;

    /**
     * Revealed support card for the current battle.
     * (Hidden support choices are kept server-side until reveal.)
     */
    @type(CardSchema) supportCard: CardSchema | null = null;
    @type("boolean") supportLocked: boolean = false;

    /** Revealed after both players lock in (hidden choices kept server-side). */
    @type("string") selectedAttack: string | null = null;
    @type("boolean") attackLocked: boolean = false;
}

export class BattleStateSchema extends Schema {
    @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
    @type("string") phase: string = "waiting"; // waiting, draw, preparation, battle_support, battle_reveal, battle_attack, resolution, victory
    @type("number") turn: number = 1;
    @type("string") activePlayerSessionId: string = "";
    @type("string") message: string = "Waiting for players...";

    @type("string") winnerSessionId: string = "";
    @type("string") loserReason: string = ""; // points | deck_out | disconnect
}
