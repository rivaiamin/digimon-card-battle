export interface Attack {
  name: string;
  damage: number;
  type: 'circle' | 'triangle' | 'cross';
  description: string;
  effect?: string;
}

export type CardKind = 'digimon' | 'option' | 'evolution_option';
export type EffectArgValue = string | number | boolean;
export type EffectArgs = Record<string, EffectArgValue>;

/**
 * Historical type name kept for compatibility with UI components.
 * This now represents a generic battle card payload and includes `cardKind`.
 */
export interface DigimonCardData {
  id: string;
  name: string;
  cardKind: CardKind;
  /** Normalized effect identifier for data-driven resolvers. */
  effectId?: string;
  /** Effect arguments for `effectId`. */
  effectArgs?: EffectArgs;
  level: 'Rookie' | 'Champion' | 'Ultimate' | 'Mega' | 'Armor';
  type: 'Fire' | 'Ice' | 'Nature' | 'Dark' | 'Rare';
  hp: number;
  maxHp: number;
  dp: number; // Current DP if on field (rarely used this way but kept)
  plusDp: number; // DP gained when discarded
  evoCost: number; // DP cost to evolve into this card
  attacks?: {
    circle: Attack;
    triangle: Attack;
    cross: Attack;
  } | null;
  supportEffect?: {
    type:
      | 'void_enemy_support'
      | 'first_strike'
      | 'change_attack'
      | 'atk_mult'
      | 'halve_hp'
      | 'atk_buff'
      | 'hp_heal';
    targetAttack?: 'circle' | 'triangle' | 'cross' | 'all';
    value: number;
    description: string;
    requireType?: string;
    priority?: number;
  };
  image: string;
}

export interface PlayerState {
  active: DigimonCardData | null;
  evolutionStack?: DigimonCardData[];
  hp: number;
  hand: DigimonCardData[];
  deck: DigimonCardData[];
  trash: DigimonCardData[];
  dp: number;
  score: number;
  supportCard: DigimonCardData | null;
  supportLocked?: boolean;
  selectedAttack: 'circle' | 'triangle' | 'cross' | null;
  attackLocked?: boolean;
}

export interface GameState {
  player: PlayerState;
  opponent: PlayerState;
  phase:
    | 'waiting'
    | 'draw'
    | 'preparation'
    | 'battle_support'
    | 'battle_reveal'
    | 'battle_attack'
    | 'resolution'
    | 'victory';
  turn: number;
  isPlayerTurn: boolean;
  message: string;
  /** preparation only: discard cards for DP, then evolve */
  prepSubPhase: "" | "discard" | "evolve";
  hasDiscarded: boolean;
  winnerSessionId?: string;
  loserReason?: 'points' | 'deck_out' | 'disconnect' | string;
}
