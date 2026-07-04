/**
 * Pre-full-catalog card ids → official US DDCB catalog ids (000–300).
 *
 * Only maps ids that are **not** in the current catalog (synthetic option ids,
 * slug constants, and out-of-range numbers). Ambiguous numeric ids that now
 * belong to different cards (e.g. old `001` Agumon vs catalog `001` Omnimon I)
 * are intentionally left alone — callers should use official ids.
 */

/** Removed / synthetic ids from the partial catalog era. */
export const LEGACY_CARD_ID_MAP: Readonly<Record<string, string>> = {
    // Out-of-range Digimon from the partial set
    "301": "172", // Flamedramon
    "302": "176", // Submarimon

    // Synthetic option / evolution option seeds (E3)
    opt_dp_surge: "264", // Attack Chip — closest battle power option
    opt_data_draw: "276", // Digi-Diamond (draw 2)
    opt_patch_heal: "274", // Digi-Amethyst (heal 100)
    opt_battle_spike: "264", // Attack Chip (+300 all)
    evo_opt_warp: "297", // Warp Digivolve
    evo_opt_special: "295", // Special Digivolve
    // evo_opt_full_power had no DDCB equivalent — omit

    // Slug ids formerly used in constants.ts / demos
    agumon: "027",
    greymon: "014",
    metalgreymon: "009",
    wargreymon: "002",
    biyomon: "029",
    birdramon: "020",
    gabumon: "062",
    garurumon: "046",
    weregarurumon: "039",
    metalgarurumon: "037",
    tentomon: "097",
    kabuterimon: "086",
    demidevimon: "132",
    devimon: "120",
    myotismon: "111",
    piedmon: "107",
    flamedramon: "172",
    submarimon: "176",
    megakabuterimon: "079",
    herculeskabuterimon: "074",
};

/**
 * Resolve a possibly-legacy catalog base id to the official id.
 * Unknown legacy keys and already-official ids pass through unchanged.
 */
export function resolveCatalogCardId(cardId: string): string {
    return LEGACY_CARD_ID_MAP[cardId] ?? cardId;
}

/** Map a deck list through {@link resolveCatalogCardId}. */
export function migrateDeckCardIds(cardIds: readonly string[]): string[] {
    return cardIds.map(resolveCatalogCardId);
}
