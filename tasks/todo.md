# Task checklist

Linked plan: `tasks/plan.md`

---

## Part A — #01 Share domain vocabulary (worth doing: **S**, ~1 session)

### Phase A1: Shared type definition

- [x] **Task A1:** Centralize `AttackType` and `AttackTarget` in `src/types.ts`

### Phase A2: Parallel import migrations (after A1)

- [x] **Task A2:** Migrate attack/effect library consumers
- [x] **Task A3:** Migrate room and scenario consumers
- [x] **Task A4:** Migrate UI/VFX consumers

#### Checkpoint A
- [x] `pnpm lint` passes
- [x] `pnpm test` passes
- [x] No new imports from `constants.ts` for pure types

### Phase A3: Named card vocabularies

- [x] **Task A5:** Add `Specialty` and `DigimonLevel` unions on `DigimonCardData` only
- [x] **Task A6:** Migrate remaining test/script consumers and remove the compatibility re-export

#### Checkpoint A complete
- [x] A1–A6 verified; user approved starting #02 implementation

---

## Part B — #02 Effect normalization before battle (**M–L**, multi-session)

### Phase B1: Contract and inventory

- [x] **Task B1:** Define separate `effectPlan` contract and schema transport
- [x] **Task B2:** Inventory catalog effects and parser gaps

#### Checkpoint B1
- [x] `pnpm lint` passes
- [x] Inventory output captured in plan or PR notes

### Phase B2: Materialize at build time

- [x] **Task B3:** Materialize plans from existing parsed clauses/conditions
- [x] **Task B4:** Serialize/validate condition AST
- [x] **Task B5:** Emit plan at catalog build; backfill `cards.json`
- [x] **Task B6:** Loader validates and preserves support-effect plan

*B3 and B4 may run in parallel after B1 fixes the plan and condition shapes.*

#### Checkpoint B2
- [ ] `pnpm cards:build` succeeds
- [ ] `pnpm test` passes
- [x] Inventory shows plans for all parser-recognized eligible cards

### Phase B3: Execute plan at runtime (dual-read)

- [x] **Task B7:** Execute plan in shared dispatcher (dual-read)
- [x] **Task B8:** Route Options through validated plans; retain migration fallback only
- [x] **Task B9:** Forward `effectPlanJson` through room state

#### Checkpoint B3
- [x] `pnpm exec tsx scripts/verify-option-dispatch.ts G1` through `G4`
- [x] `pnpm exec tsx scripts/verify-specialty-gates.ts G1` through `G3`
- [x] `src/lib/optionDispatch.test.ts` and `src/rooms/BattleRoom.test.ts` pass
- [x] Typecheck (`pnpm lint`) passes

### Phase B4: Shrink prose dependency

- [x] **Task B10:** Classify remaining `catalog_text` gaps; keep unsupported semantics explicit
- [x] **Task B11:** Update specialty-gate verifier to consume plan semantics

#### Checkpoint B4
- [x] Inventory contains no unsupported “implemented” effect hidden behind prose; only documented exclusions remain
- [ ] `pnpm test:fidelity` passes or documented exclusions remain explicit

### Phase B5: Runtime proof and cutover

- [x] **Task B13:** BattleRoom regressions for catalog Option power effects, compound/conditional plans, and SnowAgumon Cross-to-zero
- [ ] **Task B14:** Remove description fallback after plan coverage and runtime tests pass

#### Checkpoint B complete
- [ ] All Part B acceptance criteria met
- [ ] Ready for human review

---

## Task details (acceptance + verification)

### Task A1: Centralize `AttackType` and `AttackTarget`

**Description:** Add shared `AttackType` and `AttackTarget` types to `src/types.ts`; update the card model fields to use them. Keep `phaseTimer.ATTACK_TYPES` as the single runtime value list, checked against the shared type.

**Acceptance criteria:**
- [x] One shared `AttackType` union in `src/types.ts`
- [x] `phaseTimer.ATTACK_TYPES` remains the sole runtime enumeration
- [x] Resolver/parser-local unions are removed or re-exported only for compatibility

**Verification:**
- [x] `pnpm lint`
- [x] `pnpm test`

**Dependencies:** None  
**Files likely touched:** `src/types.ts`, `src/lib/phaseTimer.ts`, `src/lib/effectTextNormalize.ts`, `src/lib/supportResolver.ts`  
**Estimated scope:** Small (2–4 files)

---

### Task A2: Migrate attack/effect library consumers

**Description:** Import the shared attack type in `supportResolver`, `effectTextNormalize`, `effectCondition`, `battleEffectEngine`, and `optionResolver`; remove local aliases and avoid accidental runtime-value imports.

**Acceptance criteria:**
- [x] These five modules have no private `AttackType` union
- [x] Existing `letterToAttack` and resolver behavior is unchanged

**Verification:**
- [x] `pnpm lint`
- [x] `pnpm test`

**Dependencies:** A1  
**Files likely touched:** five listed `src/lib/*.ts` modules  
**Estimated scope:** Medium (5 files)

---

### Task A3: Migrate room and scenario consumers

**Description:** Point `BattleRoom`, `combatStrikePlan`, and `fidelityScenarioRunner` to the canonical type; migrate affected test imports without changing behavior.

**Acceptance criteria:**
- [x] Room and scenario types resolve from `src/types.ts`
- [x] `combatStrikePlan` no longer imports the type indirectly from `supportResolver`

**Verification:**
- [x] `pnpm lint`
- [x] `pnpm test`

**Dependencies:** A1  
**Files likely touched:** `src/rooms/BattleRoom.ts`, `src/lib/combatStrikePlan.ts`, `src/lib/fidelityScenarioRunner.ts`  
**Estimated scope:** Small (3 files)

---

### Task A4: Migrate UI/VFX consumers

**Description:** Replace inline attack unions in Arena, BattleHUD, attack panels/overlay, and the VFX hook with the shared type; remove the hook's duplicate public alias.

**Acceptance criteria:**
- [x] UI attack consumers import `AttackType` from `src/types.ts`
- [x] No behavior change in attack selection or VFX mapping

**Verification:**
- [x] `pnpm lint`
- [x] `pnpm build`

**Dependencies:** A1  
**Files likely touched:** `src/components/Arena.tsx`, `src/components/BattleHUD.tsx`, `src/components/battle/AttackRevealOverlay.tsx`, `src/components/battle/AttackStrikePanel.tsx`, `src/hooks/useBattleVfx.ts`
**Estimated scope:** Medium (5 files)

---

### Task A5: Specialty and level unions

**Description:** Add named `Specialty` and `DigimonLevel` unions for `DigimonCardData` only; do not narrow `CardSchema` or loader inputs.

**Acceptance criteria:**
- [x] `DigimonCardData.level` uses `DigimonLevel`, preserving `Armor`
- [x] `DigimonCardData.type` uses `Specialty`
- [x] Catalog loader still accepts empty `level` for Options

**Verification:**
- [x] `pnpm lint`
- [x] `src/lib/evolutionEligibility.test.ts`

**Dependencies:** A1–A4  
**Files likely touched:** `src/types.ts`, and casts only if compile errors require them  
**Estimated scope:** Small

### Task A6: Remove attack type compatibility re-export

**Description:** Import `AttackType` directly in the remaining support tests, room test, and resolution verifier; remove the re-export from `supportResolver`.

**Acceptance criteria:**
- [x] No internal consumer imports `AttackType` from `supportResolver`
- [x] `supportResolver` does not re-export the shared type

**Verification:**
- [x] `pnpm lint`
- [x] Focused support and resolution tests/verifier

**Dependencies:** A2–A5  
**Files likely touched:** `src/lib/supportOrdering.test.ts`, `src/lib/supportPrimitives.test.ts`, `src/rooms/BattleRoom.test.ts`, `src/lib/supportResolver.ts`, `scripts/verify-resolution-order.ts`  
**Estimated scope:** Medium (5 files)


---

### Task B1: Define separate effect-plan v1 contract

**Description:** Define a versioned plan type, separate from scalar `EffectArgs`, carried as `supportEffect.effectPlan` in normalized catalog data and `SupportEffectSchema.effectPlanJson` in room state.

**Acceptance criteria:**
- [x] Plan discriminates effect leaves, ordered compose steps, and conditional (`when` + ordered steps)
- [x] Every plan node is JSON-serializable and has `planVersion: 1`
- [x] Unsupported version / malformed plan has a defined rejection path before execution

**Verification:**
- [x] Typecheck
- [x] Deterministic validation/round-trip tests for valid and invalid shapes

**Dependencies:** None  
**Files likely touched:** `src/lib/effectPlan.ts`, `src/lib/effectPlan.test.ts`, `src/schema/BattleState.ts`, `src/lib/cardCatalogLoader.ts`  
**Estimated scope:** Small–Medium

---

### Task B2: Catalog inventory

**Description:** Report per-card effect type, `catalog_text`, compose/conditional counts, and later missing or invalid plans. Baseline is already measured at 110 / 47 / 46.

**Acceptance criteria:**
- [x] Runnable inventory against generated `cards.json`
- [x] Report exact card IDs for unresolved effects; do not count a resolver mapping as proof of full clause execution

**Verification:**
- [x] Script output agrees with the current measured totals
- [x] Inventory distinguishes missing/invalid plans from parser-unresolved effects; post-generation coverage is directly measurable

**Dependencies:** None; parallel with B1  
**Files likely touched:** `scripts/inventory-effect-plans.ts`  
**Estimated scope:** Small

---

### Task B3: Materialize plans from descriptions

**Description:** Add a pure parser-side materializer that converts recognized clauses/conditions into the B1 plan representation. Keep description text for display.

**Acceptance criteria:**
- [x] Compose steps preserve the current clause order and inherited-target behavior
- [x] Conditional plans preserve each parsed condition and consequent step
- [x] Unparseable text remains explicitly unresolved, never silently omitted

**Verification:**
- [x] Parser tests for compound, conditional, target inheritance, and unresolved text
- [x] Resolution-order golden checks G1–G3
- [x] All 193 parser-recognized catalog candidates materialize; failed IDs: none

**Dependencies:** B1 contract  
**Files likely touched:** `src/lib/effectTextNormalize.ts`, `src/lib/effectTextNormalize.test.ts`  
**Estimated scope:** Medium

---

### Task B4: Serialize and validate conditions

**Description:** Add a JSON-safe codec for the existing `Condition` union so materialized conditions evaluate with the existing condition evaluator.

**Acceptance criteria:**
- [x] Round-trip each `parseCondition` kind in deterministic tests
- [x] Invalid serialized condition is rejected before execution

**Verification:**
- [x] `pnpm lint`
- [x] `src/lib/effectCondition.test.ts` covers all 22 condition kinds and invalid shapes

**Dependencies:** B1; can run parallel with B3 against the agreed condition shape  
**Files likely touched:** `src/lib/effectCondition.ts`, tests  
**Estimated scope:** Small–Medium

---

### Task B5: Emit plans from catalog build

**Description:** When `buildCardCatalog.ts` infers an executable support effect, emit a sibling `supportEffect.effectPlan` field and regenerate the derived card catalog.

**Acceptance criteria:**
- [x] Every inferred compose/conditional/catalog-text candidate has a valid plan preserving all parsed clauses
- [x] Plan output is deterministic for repeated materialization of the same source text

**Verification:**
- [ ] `pnpm cards:build` — unavailable: `scripts/data/asyrafkz/cards.json` is absent
- [x] B2 inventory confirms 193 valid plans, zero missing/invalid, and stable output

**Dependencies:** B3, B4  
**Files likely touched:** `scripts/buildCardCatalog.ts`, `src/data/cards.json`  
**Estimated scope:** Medium

---

### Task B6: Normalize and validate plans

**Description:** Add `effectPlan` to normalized support-effect data and validate generated plan data in `cardCatalogLoader`.

**Acceptance criteria:**
- [x] `loadCardCatalog(cardsData)` preserves plans on option and Digimon support entries
- [x] Invalid plan fails with card ID and reason

**Verification:**
- [x] Loader tests for a valid plan and malformed plan
- [x] `pnpm exec vitest run` (38 files, 348 tests)

**Dependencies:** B1, B5  
**Files likely touched:** `src/lib/cardCatalogLoader.ts`  
**Estimated scope:** Small–Medium

---

### Task B7: Execute normalized plans (dual-read)

**Description:** Dispatch a validated plan from `SupportEffectSchema.effectPlanJson`; keep current description parsing only as a temporary fallback for old catalog records.

**Acceptance criteria:**
- [x] Exact state changes cover ordered plan effects and conditional gates; legacy prose fallback remains covered
- [x] Plan execution preserves runtime conditions, enclosing support priority, and operation order
- [x] Malformed plan JSON is rejected before effects and does not fall back to prose

**Verification:**
- [x] `src/lib/supportPrimitives.test.ts`
- [x] Resolution-order verifier G1, G2, and G3

**Dependencies:** B6  
**Files likely touched:** `src/lib/supportResolver.ts`, tests  
**Estimated scope:** Medium

---

### Task B8: Option path carries the plan

**Description:** `optionResolver.toSupportEffect` copies a validated normalized plan into the support-effect payload; retain prose inference only for pre-migration cards.

- [x] Catalog-backed Option plan reaches the shared dispatcher intact
- [x] Unsupported/unresolved text still reports unresolved, not a silent no-op

**Verification:**
- [x] `src/lib/optionDispatch.test.ts`
- [x] `pnpm exec tsx scripts/verify-option-dispatch.ts G1` through `G4`

**Dependencies:** B7  
**Files likely touched:** `src/lib/optionResolver.ts`  
**Estimated scope:** Small

---

### Task B9: Forward plans through BattleRoom

**Description:** Map normalized `effectPlan` to `SupportEffectSchema.effectPlanJson` and preserve it through Option and Digimon support resolution.

**Acceptance criteria:**
- [x] No plan is dropped between catalog load, schema serialization, and resolver input
- [x] Existing card behavior and user-visible support descriptions remain unchanged

**Verification:**
- [x] Real `BattleRoom` test resolves one catalog Option and one Digimon support plan
  with legacy descriptions deliberately made unparseable

**Dependencies:** B6–B8  
**Files likely touched:** `src/schema/BattleState.ts`, `src/rooms/BattleRoom.ts`, room tests  
**Estimated scope:** Medium
---


### Task B10: Classify residual plan gaps

**Description:** Review all B2 unresolved IDs and decide whether they need parser/runtime work in this effect-plan rollout.

**Acceptance criteria:**
- [x] Record `200` (“None”), `257` Partner Finder, and `293`–`300` as explicit exclusions with distinct reasons
- [x] Do not generate plans for effects whose runtime behavior is not implemented

**Verification:**
- [x] `pnpm exec tsx scripts/inventory-effect-plans.ts` reports 193 valid, zero missing, zero invalid, and the documented unresolved IDs
- [x] `pnpm exec tsx scripts/verify-option-dispatch.ts G2` reports Partner Finder as unresolved with its card id

**Dependencies:** B5
**Files likely touched:** `tasks/plan.md`, `tasks/todo.md`
**Estimated scope:** Small

---

### Task B11: Update specialty-gate verifier

**Description:** Compare nested plan conditions to specialty conditions in text; retain explicit gate-field checks for effects without a matching plan condition.

**Acceptance criteria:**
- [x] Verifier passes with plan-first cards
- [x] Replacing a card's plan condition with a mismatched specialty is detected

**Verification:**
- [x] `pnpm exec tsx scripts/verify-specialty-gates.ts G1` through `G3`

**Dependencies:** B7  
**Files likely touched:** `scripts/verify-specialty-gates.ts`  
**Estimated scope:** Small

---

### Task B14: Remove description fallback

**Description:** Delete runtime compose/conditional prose parsing only after all executable catalog cards carry validated plans and the room regressions pass.

**Acceptance criteria:**
- [ ] No runtime prose parsing for compose/conditional in support resolution
- [ ] Loader rejects or explicitly flags a missing plan before execution

**Verification:**
- [ ] `pnpm test`
- [ ] `pnpm test:fidelity`
- [ ] `pnpm exec tsx scripts/verify-option-dispatch.ts` and `verify-specialty-gates.ts`

**Dependencies:** B5, B7–B13, inventory proves every supported compose/conditional has a valid plan  
**Files likely touched:** `src/lib/supportResolver.ts`, `src/lib/optionResolver.ts`, verifier if needed  
**Estimated scope:** Medium

---

### Task B13: Real-room effect regressions

**Description:** Extend `BattleRoom.test.ts` to lock down catalog-driven attack-power changes through support reveal and final strike resolution, including SnowAgumon Cross-to-zero; cover every clause in a compound/conditional plan.

- [x] Assert exact strike damage for additive, multiplier, targeted-zero, and conditional Option examples, with a slot/gate control
- [x] SnowAgumon `067` Cross vs Cross yields no canceled opponent strike and preserves target HP
- [x] Compound tests prove every clause, not merely one state mutation

**Verification:**
- [x] `pnpm exec vitest run src/rooms/BattleRoom.test.ts`
- [x] Typecheck (`pnpm exec tsc --noEmit`)
- [x] `pnpm exec tsx scripts/verify-option-dispatch.ts G1`

**Dependencies:** B7–B9  
**Files likely touched:** `src/rooms/BattleRoom.test.ts`  
**Estimated scope:** Small

---

