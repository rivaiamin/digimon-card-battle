export interface Attack {
  name: string;
  damage: number;
  type: 'circle' | 'triangle' | 'cross';
  description: string;
  effect?: string;
}

export interface DigimonCardData {
  id: string;
  name: string;
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
  hasDiscarded: boolean;
  winnerSessionId?: string;
  loserReason?: 'points' | 'deck_out' | 'disconnect' | string;
}
