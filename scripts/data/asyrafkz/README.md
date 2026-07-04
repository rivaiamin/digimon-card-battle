# AsyrafKZ DDCB data collection (vendored)

Source: [AsyrafKZ/digital-card-battle-clone-data-collection](https://github.com/AsyrafKZ/digital-card-battle-clone-data-collection)

Used as the primary structured dump of US *Digimon Digital Card Battle* card stats, option text, and effect strings. Cross-checked against the GameFAQs card-collection notes cited in `docs/8.0 Fidelity Checklist & Epic Backlog.md`.

| File | Role |
|---|---|
| `cards.json` | Combined `monster_cards` + `option_cards` (301 entries) |
| `monsterCards.json` | Digimon-only slice |
| `optionCards.json` | Option / evolution-option slice |
| `effectList.txt` | Per-card interleaved X-effect + support lines (card order) |
| `effectList2.txt` | Unique effect strings (canonical effect vocabulary) |
| `effectList3.txt` / `effectList4.txt` | Tokenized / lowercased effect atoms |
| `option_cards_neoseeker.txt` | Neoseeker wiki option templates |
| `result.json` | Per-card `x_speed` / `support_speed` |

Rebuild pipeline:

```bash
pnpm cards:build
```

That runs `scripts/buildCardCatalog.ts` (cards) and `scripts/buildEffectCatalog.ts` (effects).
