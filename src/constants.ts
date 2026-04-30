import { DigimonCardData } from "./types";

export const AGUMON: DigimonCardData = {
  id: "agumon",
  name: "AGUMON",
  level: "Rookie",
  type: "Fire",
  hp: 380,
  maxHp: 380,
  dp: 0,
  plusDp: 10,
  evoCost: 0,
  image: "A",
  attacks: {
    circle: { name: "Pepper Breath", damage: 150, type: "circle", description: "Fires a small fireball from the mouth." },
    triangle: { name: "Sharp Claw", damage: 100, type: "triangle", description: "Slashes with sharp claws." },
    cross: { name: "Spitfire", damage: 120, type: "cross", description: "Breathes out a continuous stream of fire." }
  },
  supportEffect: { type: "atk_buff", targetAttack: "circle", value: 100, description: "Boosts Circle attack by 100 damage if the user is a Fire attribute Digimon." }
};

export const GREYMON: DigimonCardData = {
  id: "greymon",
  name: "GREYMON",
  level: "Champion",
  type: "Fire",
  hp: 650,
  maxHp: 650,
  dp: 0,
  plusDp: 20,
  evoCost: 30,
  image: "G",
  attacks: {
    circle: { name: "Mega Flame", damage: 280, type: "circle", description: "Exhales an ultra-high-temperature flame that burns everything to ash." },
    triangle: { name: "Great Horn", damage: 200, type: "triangle", description: "Charges the opponent with legendary horns." },
    cross: { name: "Tail Whip", damage: 180, type: "cross", description: "A powerful tail strike that can knock back foes." }
  },
  supportEffect: { type: "atk_buff", targetAttack: "all", value: 50, description: "Increases all attack power by 50. If opponent is level Rookie, bonus increases to +100." }
};

export const METALGREYMON: DigimonCardData = {
  id: "metalgreymon",
  name: "METALGREYMON",
  level: "Ultimate",
  type: "Fire",
  hp: 950,
  maxHp: 950,
  dp: 0,
  plusDp: 30,
  evoCost: 50,
  image: "MG",
  attacks: {
    circle: { name: "Giga Destroyer", damage: 450, type: "circle", description: "Missile." },
    triangle: { name: "Metal Slash", damage: 320, type: "triangle", description: "Claw." },
    cross: { name: "Tera Destroyer", damage: 280, type: "cross", description: "Impact." }
  }
};

export const WARGREYMON: DigimonCardData = {
  id: "wargreymon",
  name: "WARGREYMON",
  level: "Mega",
  type: "Fire",
  hp: 1200,
  maxHp: 1200,
  dp: 0,
  plusDp: 40,
  evoCost: 80,
  image: "WG",
  attacks: {
    circle: { name: "Gaia Force", damage: 600, type: "circle", description: "Nova." },
    triangle: { name: "Great Tornado", damage: 450, type: "triangle", description: "Drill." },
    cross: { name: "Brave Shield", damage: 300, type: "cross", description: "Block." }
  }
};

export const TENTOMON: DigimonCardData = {
  id: "tentomon",
  name: "TENTOMON",
  level: "Rookie",
  type: "Nature",
  hp: 350,
  maxHp: 350,
  dp: 0,
  plusDp: 10,
  evoCost: 0,
  image: "T",
  attacks: {
    circle: { name: "Super Shocker", damage: 140, type: "circle", description: "Electric." },
    triangle: { name: "Horn Attack", damage: 110, type: "triangle", description: "Sharp." },
    cross: { name: "Talon Twist", damage: 90, type: "cross", description: "Agile." }
  },
  supportEffect: { type: "hp_heal", value: 150, description: "Recover 150 HP" }
};

export const KABUTERIMON: DigimonCardData = {
  id: "kabuterimon",
  name: "KABUTERIMON",
  level: "Champion",
  type: "Nature",
  hp: 600,
  maxHp: 600,
  dp: 0,
  plusDp: 20,
  evoCost: 30,
  image: "K",
  attacks: {
    circle: { name: "Mega Blaster", damage: 260, type: "circle", description: "Beam." },
    triangle: { name: "Beetle Horn", damage: 190, type: "triangle", description: "Ram." },
    cross: { name: "Insect Breath", damage: 150, type: "cross", description: "Gas." }
  },
  supportEffect: { type: "atk_buff", targetAttack: "triangle", value: 100, description: "Triangle +100" }
};

export const GABUMON: DigimonCardData = {
  id: "gabumon",
  name: "GABUMON",
  level: "Rookie",
  type: "Ice",
  hp: 360,
  maxHp: 360,
  dp: 0,
  plusDp: 10,
  evoCost: 0,
  image: "Gb",
  attacks: {
    circle: { name: "Blue Blaster", damage: 140, type: "circle", description: "Ice." },
    triangle: { name: "Horn Attack", damage: 100, type: "triangle", description: "Sharp." },
    cross: { name: "Petit Fire", damage: 90, type: "cross", description: "Small." }
  }
};

export const SAMPLE_PLAYER_DIGIMON = AGUMON;
export const SAMPLE_OPPONENT_DIGIMON = TENTOMON;

export const INITIAL_DECK: DigimonCardData[] = [
    { ...AGUMON, id: "p_a1" }, { ...GREYMON, id: "p_g1" },
    { ...METALGREYMON, id: "p_m1" }, { ...WARGREYMON, id: "p_w1" },
    { ...TENTOMON, id: "p_t1" }, { ...KABUTERIMON, id: "p_k1" },
    { ...GABUMON, id: "p_gb1" }, { ...AGUMON, id: "p_a2" },
    { ...GREYMON, id: "p_g2" }, { ...METALGREYMON, id: "p_m2" }
];

export const OPPONENT_DECK: DigimonCardData[] = [
    { ...TENTOMON, id: "o_t1" }, { ...KABUTERIMON, id: "o_k1" },
    { ...AGUMON, id: "o_a1" }, { ...GREYMON, id: "o_g1" },
    { ...TENTOMON, id: "o_t2" }, { ...KABUTERIMON, id: "o_k2" }
];
