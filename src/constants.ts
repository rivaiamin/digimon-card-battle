import cardsData from "./data/cards.json";
import type { DigimonCardData } from "./types";

/** When `attacks` is missing (e.g. partial Colyseus state). */
export const DEFAULT_CARD_ATTACKS: NonNullable<DigimonCardData["attacks"]> = {
    circle: { name: "—", damage: 0, type: "circle", description: "" },
    triangle: { name: "—", damage: 0, type: "triangle", description: "" },
    cross: { name: "—", damage: 0, type: "cross", description: "" },
};

type RawCatalogCard = (typeof cardsData)[number];

function toCardData(raw: RawCatalogCard): DigimonCardData {
    const attacks = "attacks" in raw && raw.attacks ? raw.attacks : null;
    const support = "supportEffect" in raw ? raw.supportEffect : undefined;

    return {
        id: raw.id,
        name: raw.name,
        cardKind: ("cardKind" in raw && raw.cardKind ? raw.cardKind : "digimon") as DigimonCardData["cardKind"],
        effectId: "effectId" in raw ? raw.effectId : undefined,
        effectArgs: "effectArgs" in raw ? (raw.effectArgs as DigimonCardData["effectArgs"]) : undefined,
        level: (raw.level || "Rookie") as DigimonCardData["level"],
        type: (raw.type || "Fire") as DigimonCardData["type"],
        hp: Number(raw.hp ?? 0),
        maxHp: Number(raw.maxHp ?? raw.hp ?? 0),
        dp: 0,
        plusDp: Number(raw.plusDp ?? 0),
        evoCost: Number(raw.evoCost ?? 0),
        image: String(raw.image ?? ""),
        attacks: attacks
            ? {
                  circle: {
                      name: attacks.circle.name,
                      damage: attacks.circle.damage,
                      type: "circle",
                      description: attacks.circle.description ?? "",
                      effect: "effectId" in attacks.circle ? String(attacks.circle.effectId ?? "") : undefined,
                  },
                  triangle: {
                      name: attacks.triangle.name,
                      damage: attacks.triangle.damage,
                      type: "triangle",
                      description: attacks.triangle.description ?? "",
                      effect: "effectId" in attacks.triangle ? String(attacks.triangle.effectId ?? "") : undefined,
                  },
                  cross: {
                      name: attacks.cross.name,
                      damage: attacks.cross.damage,
                      type: "cross",
                      description: attacks.cross.description ?? "",
                      effect: "effectId" in attacks.cross ? String(attacks.cross.effectId ?? "") : undefined,
                  },
              }
            : null,
        supportEffect: support
            ? {
                  type: support.type as NonNullable<DigimonCardData["supportEffect"]>["type"],
                  targetAttack: "targetAttack" in support
                      ? (support.targetAttack as NonNullable<DigimonCardData["supportEffect"]>["targetAttack"])
                      : undefined,
                  value: Number(support.value ?? 0),
                  description: String(support.description ?? ""),
                  requireType: "requireType" in support ? support.requireType : undefined,
                  priority: "priority" in support ? Number(support.priority ?? 0) : undefined,
              }
            : undefined,
    };
}

function cardById(id: string): DigimonCardData {
    const raw = cardsData.find(c => c.id === id);
    if (!raw) {
        throw new Error(`[constants] Missing catalog card "${id}"`);
    }
    return toCardData(raw);
}

/** Official DDCB catalog ids (see `src/data/cards.json`). */
export const AGUMON = cardById("027");
export const GREYMON = cardById("014");
export const METALGREYMON = cardById("009");
export const WARGREYMON = cardById("002");
export const TENTOMON = cardById("097");
export const KABUTERIMON = cardById("086");
export const GABUMON = cardById("062");

export const SAMPLE_PLAYER_DIGIMON = AGUMON;
export const SAMPLE_OPPONENT_DIGIMON = TENTOMON;

/** Demo decks use instance ids; base stats come from the official catalog. */
export const INITIAL_DECK: DigimonCardData[] = [
    { ...AGUMON, id: "p_a1" },
    { ...GREYMON, id: "p_g1" },
    { ...METALGREYMON, id: "p_m1" },
    { ...WARGREYMON, id: "p_w1" },
    { ...TENTOMON, id: "p_t1" },
    { ...KABUTERIMON, id: "p_k1" },
    { ...GABUMON, id: "p_gb1" },
    { ...AGUMON, id: "p_a2" },
    { ...GREYMON, id: "p_g2" },
    { ...METALGREYMON, id: "p_m2" },
];

export const OPPONENT_DECK: DigimonCardData[] = [
    { ...TENTOMON, id: "o_t1" },
    { ...KABUTERIMON, id: "o_k1" },
    { ...AGUMON, id: "o_a1" },
    { ...GREYMON, id: "o_g1" },
    { ...TENTOMON, id: "o_t2" },
    { ...KABUTERIMON, id: "o_k2" },
];
