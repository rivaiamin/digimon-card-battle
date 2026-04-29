import { DigimonCardData } from "./types";

export const SAMPLE_PLAYER_DIGIMON: DigimonCardData = {
  id: "p1",
  name: "AGUMON",
  level: "Rookie",
  type: "Fire",
  hp: 380,
  maxHp: 380,
  dp: 0,
  image: "A",
  attacks: {
    circle: { name: "Pepper Breath", damage: 150, type: "circle", description: "Standard." },
    triangle: { name: "Sharp Claw", damage: 100, type: "triangle", description: "Quick." },
    cross: { name: "Spitfire", damage: 120, type: "cross", description: "Counter." }
  },
  effect: "Next turn: ATK +20"
};

export const SAMPLE_OPPONENT_DIGIMON: DigimonCardData = {
  id: "o1",
  name: "TENTOMON",
  level: "Rookie",
  type: "Nature",
  hp: 380,
  maxHp: 380,
  dp: 0,
  image: "T",
  attacks: {
    circle: { name: "Super Shocker", damage: 140, type: "circle", description: "Electric." },
    triangle: { name: "Horn Attack", damage: 110, type: "triangle", description: "Sharp." },
    cross: { name: "Talon Twist", damage: 90, type: "cross", description: "Agile." }
  }
};

export const MINI_CARDS: DigimonCardData[] = [
    { ...SAMPLE_PLAYER_DIGIMON, id: "m1", name: "PATAMON", hp: 320, maxHp: 320 },
    { ...SAMPLE_PLAYER_DIGIMON, id: "m2", name: "BETAMON", hp: 350, maxHp: 350 },
    { ...SAMPLE_PLAYER_DIGIMON, id: "m3", name: "PALMON", hp: 340, maxHp: 340 },
    { ...SAMPLE_PLAYER_DIGIMON, id: "m4", name: "GABUMON", hp: 360, maxHp: 360 },
];
