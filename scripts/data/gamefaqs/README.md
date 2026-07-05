# GameFAQs base deck list (vendored)

Primary source (preferred): [`docs/base_decks.html`](../../../docs/base_decks.html) — saved ZeoKnight formatted FAQ page:

- https://gamefaqs.gamespot.com/ps/526754-digimon-digital-card-battle/faqs/78563/base-deck-list

Fallback: `base-deck-list.txt` — RYakuto plain-text “Deck listings” section (line-wrapped; harder to parse).

```bash
python3 tools/parse_base_decks.py
# or
pnpm decks:build
```

Output: `src/data/decks.json`
