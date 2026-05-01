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
    type: 'atk_buff' | 'hp_heal' | 'change_attack' | 'halve_hp';
    targetAttack?: 'circle' | 'triangle' | 'cross' | 'all';
    value: number;
    description: string;
  };
  image: string;
}

export interface PlayerState {
  active: DigimonCardData | null;
  hp: number;
  hand: DigimonCardData[];
  deck: DigimonCardData[];
  trash: DigimonCardData[];
  dp: number;
  score: number;
  supportCard: DigimonCardData | null;
  selectedAttack: 'circle' | 'triangle' | 'cross' | null;
}

export interface GameState {
  player: PlayerState;
  opponent: PlayerState;
  phase: 'draw' | 'evolution' | 'preparation' | 'support' | 'battle' | 'resolution' | 'victory';
  turn: number;
  isPlayerTurn: boolean;
  message: string;
  hasDiscarded: boolean;
}
