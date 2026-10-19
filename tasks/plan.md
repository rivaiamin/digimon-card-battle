# Implementation Plan: Domain vocabulary (#01) + Effect normalization (#02)

## Overview

Two related architecture opportunities from the 18 Oct 2026 review:

1. **#01 — Share domain vocabulary** (attack slots, optional specialty/level names): low-risk type consolidation. Worth doing as a **small prerequisite slice**, not a “constants framework.”
2. **#02 — Finish effect normalization before battle**: deepen the catalog ingestion seam so `compose` / `conditional` / surviving `catalog_text` do not re-parse prose at resolution time. **Primary implementation effort** lives here.

Gameplay semantics stay frozen unless explicitly called out: pre-Cross damage remains `floor((base + flat) × mult)` with absolute overrides; Crash / Counter / Eat-Up stay in strike resolution (`battleEffectEngine`), not in a unified formula.

**Task list:** `tasks/todo.md`

---

## #01 Verdict: Worth it (small scope)

| Factor | Assessment |
|--------|------------|
| Depth | Shallow by design — one shared **interface** (types), not a new module |
| Leverage | ~15 call sites repeat `AttackType`; `combatStrikePlan` already imports from `supportResolver` instead of a single owner |
| Risk | Low if limited to types + imports; **do not** narrow `BattleState` schema strings or move vocabulary into `constants.ts` (catalog import coupling) |
| Blocks #02? | No hard blocker; optional cleanup before touching effect modules |

**Do not do for #01:** a catch-all `constants.ts` for every literal; sixth specialty `Darkness` as canonical; folding `Armor` into `EVOLUTION_LEVEL_ORDER`; changing damage math.

---

## #01 Architecture decisions

- **Single owner for `AttackType`:** `src/types.ts` (or `src/domain/attacks.ts` only if `types.ts` grows unwieldy — default: `types.ts`).
- **Runtime enumeration:** keep `ATTACK_TYPES` in `phaseTimer.ts`; type it as `readonly AttackType[]` imported from `types.ts` (one list, no second declaration).
- **`AttackTarget`:** `AttackType | "all"` for support `targetAttack` fields in TS-only code; schema stays `string`.
- **Specialty / level names:** export `Specialty` and `DigimonLevel` unions on `DigimonCardData` only; catalog loader and schema continue accepting arbitrary strings for legacy/option cards (`level: ""`).
- **Aliases stay at adapters:** `Darkness` → `Dark` remains in `effectTextNormalize` / `buildCardCatalog.ts`, not in the public union.

---

## #02 Architecture decisions

- **Seam:** Catalog build + `cardCatalogLoader` adapt card descriptions into executable effects; `supportResolver.applySingleEffect` consumes them.
- **Representation recommendation:** Keep scalar `EffectArgs` unchanged and define a separate, versioned `effectPlan` field on normalized support-effect data. Serialize it through `SupportEffectSchema.effectPlanJson`.
  - A nested `effectArgs.plan` would require widening `EffectArgValue` and fixing both argument-normalization functions: `cardCatalogLoader.normalizeEffectArgs` and `effectArgs.parseEffectArgsJson` currently discard nested objects/arrays.
  - A separate field is semantically clearer and keeps ordinary effect arguments scalar. It adds one explicit schema field and catalog/room forwarding; accept that cost rather than silently smuggling an AST through `effectArgs`.
- Shape: each node carries `planVersion: 1`; leaves hold one executable support-effect primitive (type, optional target/value/gates/priority), `compose` holds ordered steps, and `conditional` holds a serialized `when` condition plus ordered steps. `description` remains display/source text, not executable data. Validate shape and version before execution.
- Display descriptions remain display/source text. The runtime plan, not the prose, determines executable clauses.
- **Migration:** dual-read plans first, description fallback second; remove fallback only after generated catalog coverage and exact runtime parity are proven.
- **Out of scope:** general expression DSL; merging `battleEffectEngine` strike semantics into support arithmetic; converting unparseable text into a false “implemented” effect.

**Current catalog baseline (measured):** 301 cards total; 102 Options; 110 `catalog_text`; 47 `compose`; 46 `conditional` support effects.

**Inventory run:** `pnpm exec tsx scripts/inventory-effect-plans.ts` reported 301 cards, 102 Options, 110 `catalog_text`, 47 `compose`, and 46 `conditional` effects. Of 203 candidates, 193 parse into a recognized effect and currently lack an attached plan; 10 remain parser-unresolved: `200`, `257`, and `293`–`300` (all `catalog_text`). The report lists each candidate's type/status and exact missing/invalid/unresolved IDs. Parser recognition is not proof of complete execution.

**Materializer coverage:** A catalog sweep compared the parser's 193 recognized candidates with `materializeEffectPlan`; all 193 produced plans and no IDs failed. Unparseable cards remain the explicit 10-ID list above.

- Runtime prose interpretation remains in `supportResolver.applySingleEffect` for `compose` / `conditional`, and `optionResolver.toSupportEffect` for `catalog_text`.
- `scripts/verify-specialty-gates.ts` currently treats compose/conditional descriptions as executable input; `optionDispatch.test.ts` exercises real `PlayerSchema` options.

**Option-resolution probe (real room path):** A single `pnpm exec tsx -e` harness loaded catalog entries, serialized them to `CardSchema`/`SupportEffectSchema`, called `BattleRoom.finishSupportRevealAndAdvance()` and battle resolution, then asserted exact strike damage and HP for 15 cases:

- `264` Attack Chip: circle 400 → 700; `273` Digi-Garnet: 400 → 500.
- `267` Attack Disk Circle: circle 400 → 800; `269` Attack Disk Cross: cross 200 → 400; `285` Wild Sevens: 400 → 1200.
- `288` Grand Sevens: at 10,000 current HP, circle 400 → 10,400 (opponent HP capped at 0).
- `229` Metal Armor: two DP-slot cards, circle 400 → 800.
- `270` Defense Disk Circle zeros circle (no P1 strike); same card with triangle control leaves 300 intact. `271` zeros triangle; `272` zeros cross.
- `203` Shogun's Order: both selected attacks produce no strike. `234` Armor Clash / `235` Silver Ball zero opponent attack and double own attack when their level gates pass; Armor Clash does neither at nonmatching Ultimate level.

**Result:** all 15 exact Option expectations passed through `BattleRoom`; these sampled Option power/zero effects work in that setup. A separate room-path check of SnowAgumon `067`, Cross vs Cross, passed: its `cross.to_zero` canceled the opponent's Cross strike; only SnowAgumon's 220-damage strike was recorded, and SnowAgumon's HP stayed at 10,000.

**Limit:** the reported discrepancy is not reproduced by these local setups. If the user still sees it, compare the exact opposing card/attack, selected slots, and battle profile; do not infer that every production scenario is fixed.

**Arithmetic stays frozen:** `floor((base + flat) * multiplier)`, then specialty / Cross and ordered strikes; absolute set overrides take precedence. Crash / Counter / Eat-Up remain distinct temporal mechanics.

---

## Dependency graph

```
#01 AttackType declaration in `src/types.ts`
    ├── A2: attack/effect library imports ─┐
    ├── A3: room/scenario imports ─────────┼── independent after A1
    └── A4: UI/VFX imports ────────────────┘

Effect-plan contract (B1) + inventory (B2)
    ├── B3: prose materializer ─┐
    └── B4: condition codec ────┴── parallel once AST contract is fixed
              ↓
        B5 catalog generation → B6 loader validation
              ↓
        B7 support dispatcher ─┬─ B8 Option adapter ─┐
                               └─ B9 room/schema ────┴── exact end-to-end parity
              ↓
        parser gap tranche → runtime regression tests → remove fallback
```

**Parallel answer:** A1 is a dependency; after it, A2/A3/A4 touch disjoint file groups and can run in parallel. #02 B1/B2 can run alongside #01 after agreeing on the plan field. After B1, B3/B4 are separate modules and can run in parallel against the fixed AST contract. Runtime/schema migration stays behind catalog generation and validation.

Implement #01 A1, then parallelize A2–A4. B1/B2 may proceed alongside those tasks; do not regenerate catalog or remove fallback until plan generation, loader validation, room forwarding, and exact regression tests agree.

---

## Risks and mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Serialized condition AST drifts from `parseCondition` | High | Single serialize/deserialize pair in `effectCondition.ts`; round-trip tests |
| Regenerated `cards.json` huge diff | Med | Dedicated `pnpm cards:build` commit; review counts not lines |
| Silent behavior change when removing re-parse | High | Dual-read until verifiers + `optionDispatch` / room tests pass |
| Specialty gates tied to description | Med | Keep `requireType` / `requireOpponentType`; materialize gates at build for simple heads |
| SnowAgumon / attack-zero mismatch | Not reproduced in local real-room check | Keep `067` Cross vs Cross exact assertion; if live mismatch persists, capture opposing card/attack, locked slots, and profile |

---

## Open questions

1. **Unparseable text:** Keep it explicitly catalog-only / unresolved; do not silently claim mechanical execution. Select parser expansion candidates from measured inventory.
2. **Specialty / level type aliases:** Defer A4 unless a consumer needs the narrower types; they do not block #02.

---

| Safe parallel | Must remain sequential |
|---------------|------------------------|
| A2 library, A3 room/scenario, and A4 UI/VFX migrations after A1 | A1 before any consumer migration |
| B1/B2 alongside #01; B3/B4 after the plan/condition contract is fixed | Plan contract before catalog generation |
| Independent implementation modules after contract; integration tests share one owner/file | Catalog generation + loader parity before runtime fallback removal |
| Parser fixture prep while room scenarios are selected | Remove fallback only after every required plan is present and verifiers pass |
