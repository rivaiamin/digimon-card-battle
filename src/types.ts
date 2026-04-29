export interface Attack {
  name: string;
  damage: number;
  type: 'circle' | 'triangle' | 'cross';
  description: string;
}

export interface DigimonCardData {
  id: string;
  name: string;
  level: 'Rookie' | 'Champion' | 'Ultimate' | 'Mega';
  type: 'Fire' | 'Ice' | 'Nature' | 'Dark' | 'Rare';
  hp: number;
  maxHp: number;
  dp: number; // Digivolve Points
  attacks: {
    circle: Attack;
    triangle: Attack;
    cross: Attack;
  };
  effect?: string;
  image: string;
}

export interface GameState {
  player: {
    active: DigimonCardData | null;
    hp: number;
    hand: DigimonCardData[];
    deck: DigimonCardData[];
    trash: DigimonCardData[];
    dp: number;
  };
  opponent: {
    active: DigimonCardData | null;
    hp: number;
    hand: DigimonCardData[];
    deck: DigimonCardData[];
    trash: DigimonCardData[];
    dp: number;
  };
  phase: 'draw' | 'evolution' | 'preparation' | 'battle' | 'end';
}
