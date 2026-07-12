import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";

export class AttackSchema extends Schema {
    @type("string") name: string = "";
    @type("number") damage: number = 0;
    @type("string") type: string = ""; // circle, triangle, cross
    @type("string") description: string = "";
    /** Cross/special attack effect (e.g. cross.counter). */
    @type("string") effectId: string = "";
    @type("string") effectArgsJson: string = "";
}

export class SupportEffectSchema extends Schema {
    @type("string") type: string = ""; // void_enemy_support | first_strike | change_attack | atk_mult | halve_hp | atk_buff | hp_heal
    @type("string") targetAttack: string = ""; // circle | triangle | cross | all
    @type("number") value: number = 0;
    @type("string") description: string = "";
    /** When set, effect only applies if the active Digimon's type matches (e.g. Fire). */
    @type("string") requireType: string = "";
    /** When set, effect only applies if the opponent's active Digimon type matches (e.g. Dark). */
    @type("string") requireOpponentType: string = "";
    /** Override stack tier (1–5); 0 = derive from type. */
    @type("number") priority: number = 0;
}

export class CardSchema extends Schema {
    @type("string") id: string = "";
    @type("string") name: string = "";
    /** digimon | option | evolution_option */
    @type("string") cardKind: string = "digimon";
    /** Normalized effect identifier (for data-driven resolvers). */
    @type("string") effectId: string = "";
    /** JSON-encoded effect arguments for `effectId`. */
    @type("string") effectArgsJson: string = "";
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

    /** Opening mulligan redraws remaining (fidelity_ps1). */
    @type("number") mulligansRemaining: number = 0;
    /** True until the player's first battle Digimon is deployed this match. */
    @type("boolean") needsOpeningDeploy: boolean = true;
    /** Active Digimon was deployed with opening level C/U penalties. */
    @type("boolean") openingPenaltyActive: boolean = false;
    /** Negative status ailments on the active digimon (JSON string array). Cleared on evolve (FC-009). */
    @type("string") statusAilmentsJson: string = "[]";
    /** Consecutive phase timeouts without voluntary action (FC-023). */
    @type("number") afkStrikes: number = 0;
    /** False while seat is in reconnect grace (FC-024). */
    @type("boolean") connected: boolean = true;
}

export class BattleStateSchema extends Schema {
    @type({ map: PlayerSchema }) players = new MapSchema<PlayerSchema>();
    @type("string") phase: string = "waiting"; // waiting, draw, preparation, battle_support, battle_reveal, battle_effects, battle_attack, resolution, victory
    /** fidelity_ps1 | legacy_online */
    @type("string") ruleProfileId: string = "fidelity_ps1";
    /** standard | no_options — explicit arena variant (FC-029). */
    @type("string") arenaVariantId: string = "standard";
    /** During preparation: mulligan → deploy → discard → evolve */
    @type("string") prepSubPhase: string = "";
    @type("number") turn: number = 1;
    @type("string") activePlayerSessionId: string = "";
    @type("string") message: string = "Waiting for players...";

    @type("string") winnerSessionId: string = "";
    @type("string") loserReason: string = ""; // points | deck_out | disconnect | afk
    /**
     * During battle_support (fidelity_ps1): session id allowed to lock support next.
     * Empty = simultaneous pick (legacy) or both committed.
     */
    @type("string") supportPickSessionId: string = "";
    /** Server wall-clock ms when the current interactive phase ends (FC-021). */
    @type("number") phaseEndsAtMs: number = 0;
    /** JSON-encoded CombatStrike[] for client sequential attack animation. */
    @type("string") combatStrikesJson: string = "";
    /** Attacker session id for the last resolved battle exchange (for client VFX). */
    @type("string") lastBattleAttackerSessionId: string = "";
    /** JSON SupportEffectsPayload for the battle_effects notification beat. */
    @type("string") supportEffectsJson: string = "";
}
