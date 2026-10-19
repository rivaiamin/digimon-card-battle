# Task checklist

Linked plan: `tasks/plan.md`

---

## Part A — #01 Share domain vocabulary (worth doing: **S**, ~1 session)

### Phase A1: Shared type definition

- [x] **Task A1:** Centralize `AttackType` and `AttackTarget` in `src/types.ts`

### Phase A2: Parallel import migrations (after A1)

- [x] **Task A2:** Migrate attack/effect library consumers
- [x] **Task A3:** Migrate room and scenario consumers
- [ ] **Task A4:** Migrate UI/VFX consumers

#### Checkpoint A
- [ ] `pnpm lint` passes
- [ ] `pnpm test` passes
- [ ] No new imports from `constants.ts` for pure types

### Phase A3: Optional names (defer unless needed)

- [ ] **Task A5:** Add `Specialty` and `DigimonLevel` unions on `DigimonCardData` only

#### Checkpoint A complete
- [ ] A1–A4 verified; human OK to start #02 implementation

---

## Part B — #02 Effect normalization before battle (**M–L**, multi-session)

### Phase B1: Contract and inventory

- [ ] **Task B1:** Define separate `effectPlan` contract and schema transport
- [ ] **Task B2:** Inventory catalog effects and parser gaps

#### Checkpoint B1
- [ ] `pnpm lint` passes
- [ ] Inventory output captured in plan or PR notes

### Phase B2: Materialize at build time

- [ ] **Task B3:** Materialize plans from existing parsed clauses/conditions
- [ ] **Task B4:** Serialize/validate condition AST
- [ ] **Task B5:** Emit plan at catalog build; regenerate `cards.json`
- [ ] **Task B6:** Loader validates and preserves support-effect plan

*B3 and B4 may run in parallel after B1 fixes the plan and condition shapes.*

#### Checkpoint B2
- [ ] `pnpm cards:build` succeeds
- [ ] `pnpm test` passes
- [ ] Inventory shows plans for all inferred compose/conditional cards

### Phase B3: Execute plan at runtime (dual-read)

- [ ] **Task B7:** Execute plan in shared dispatcher (dual-read)
- [ ] **Task B8:** Route Options through validated plans; retain migration fallback only
- [ ] **Task B9:** Forward `effectPlanJson` through room state

#### Checkpoint B3
- [ ] `pnpm exec tsx scripts/verify-option-dispatch.ts` passes
- [ ] `pnpm exec tsx scripts/verify-specialty-gates.ts` passes
- [ ] `src/lib/optionDispatch.test.ts` passes

### Phase B4: Shrink prose dependency

- [ ] **Task B10:** Extend parser for highest-impact remaining `catalog_text` gaps (tracked IDs)
- [ ] **Task B11:** Update specialty-gate verifier to consume plan semantics

#### Checkpoint B4
- [ ] Inventory contains no unsupported “implemented” effect hidden behind prose
- [ ] `pnpm test:fidelity` passes or documented exclusions remain explicit

### Phase B5: Runtime proof and cutover

- [ ] **Task B13:** BattleRoom regressions for catalog Option power effects, compound/conditional plans, and SnowAgumon Cross-to-zero
- [ ] **Task B14:** Remove description fallback after plan coverage and runtime tests pass

#### Checkpoint B complete
- [ ] All Part B acceptance criteria met
- [ ] Ready for human review

---

## Task details (acceptance + verification)

### Task A1: Centralize `AttackType` and `AttackTarget`

**Description:** Add shared `AttackType` and `AttackTarget` types to `src/types.ts`; update the card model fields to use them. Keep `phaseTimer.ATTACK_TYPES` as the single runtime value list, checked against the shared type.

**Acceptance criteria:**
- [ ] One shared `AttackType` union in `src/types.ts`
- [ ] `phaseTimer.ATTACK_TYPES` remains the sole runtime enumeration
- [ ] Resolver/parser-local unions are removed or re-exported only for compatibility

**Verification:**
- [ ] `pnpm lint`
- [ ] `pnpm test`

**Dependencies:** None  
**Files likely touched:** `src/types.ts`, `src/lib/phaseTimer.ts`, `src/lib/effectTextNormalize.ts`, `src/lib/supportResolver.ts`  
**Estimated scope:** Small (2–4 files)

---

### Task A2: Migrate attack/effect library consumers

**Description:** Import the shared attack type in `supportResolver`, `effectTextNormalize`, `effectCondition`, `battleEffectEngine`, and `optionResolver`; remove local aliases and avoid accidental runtime-value imports.

**Acceptance criteria:**
- [ ] These five modules have no private `AttackType` union
- [ ] Existing `letterToAttack` and resolver behavior is unchanged

**Verification:**
- [ ] `pnpm lint`
- [ ] `pnpm test`

**Dependencies:** A1  
**Files likely touched:** five listed `src/lib/*.ts` modules  
**Estimated scope:** Medium (5 files)

---

### Task A3: Migrate room and scenario consumers

**Description:** Point `BattleRoom`, `combatStrikePlan`, and `fidelityScenarioRunner` to the canonical type; migrate affected test imports without changing behavior.

**Acceptance criteria:**
- [ ] Room and scenario types resolve from `src/types.ts`
- [ ] `combatStrikePlan` no longer imports the type indirectly from `supportResolver`

**Verification:**
- [ ] `pnpm lint`
- [ ] `pnpm test`

**Dependencies:** A1  
**Files likely touched:** `src/rooms/BattleRoom.ts`, `src/lib/combatStrikePlan.ts`, `src/lib/fidelityScenarioRunner.ts`  
**Estimated scope:** Small (3 files)

---

### Task A4: Migrate UI/VFX consumers

**Description:** Replace inline attack unions in Arena, attack panels/overlay, and VFX hook with the shared type.

**Acceptance criteria:**
- [ ] UI attack consumers import `AttackType` from `src/types.ts`
- [ ] No behavior change in attack selection or VFX mapping

**Verification:**
- [ ] `pnpm lint`
- [ ] `pnpm build`

**Dependencies:** A1  
**Files likely touched:** `src/components/Arena.tsx`, `src/components/battle/AttackRevealOverlay.tsx`, `src/components/battle/AttackStrikePanel.tsx`, `src/hooks/useBattleVfx.ts`  
**Estimated scope:** Small (4 files)

---

### Task A5: Specialty and level unions (optional)

**Description:** Add named `Specialty` and `DigimonLevel` unions for `DigimonCardData` only if a consumer needs them; do not narrow `CardSchema` or loader inputs.

**Acceptance criteria:**
- [ ] `Armor` remains outside `EVOLUTION_LEVEL_ORDER`
- [ ] Catalog loader still accepts empty `level` for Options

**Verification:**
- [ ] `pnpm lint`
- [ ] `src/lib/evolutionEligibility.test.ts`

**Dependencies:** A1; defer until A2–A4 finish to avoid simultaneous edits to `src/types.ts`  
**Files likely touched:** `src/types.ts`, and casts only if compile errors require them  
**Estimated scope:** Small

---

### Task B1: Define separate effect-plan v1 contract

**Description:** Define a versioned plan type, separate from scalar `EffectArgs`, carried as `supportEffect.effectPlan` in normalized catalog data and `SupportEffectSchema.effectPlanJson` in room state.

**Acceptance criteria:**
- [ ] Plan discriminates leaf, ordered compose steps, and conditional (`when` + ordered steps)
- [ ] Every plan node is JSON-serializable and has `planVersion: 1`
- [ ] Unsupported version / malformed plan has a defined rejection path before execution

**Verification:**
- [ ] Typecheck
- [ ] Deterministic validation/round-trip tests for valid and invalid shapes

**Dependencies:** None  
**Files likely touched:** `src/lib/effectPlan.ts`, `src/lib/effectPlan.test.ts`, `src/schema/BattleState.ts`  
**Estimated scope:** Small–Medium

---

### Task B2: Catalog inventory

**Description:** Report per-card effect type, `catalog_text`, compose/conditional counts, and later missing or invalid plans. Baseline is already measured at 110 / 47 / 46.

**Acceptance criteria:**
- [ ] Runnable inventory against generated `cards.json`
- [ ] Report exact card IDs for unresolved effects; do not count a resolver mapping as proof of full clause execution

**Verification:**
- [ ] Script output agrees with the current measured totals
- [ ] After generation, zero eligible compose/conditional cards lack plans

**Dependencies:** None; parallel with B1  
**Files likely touched:** `scripts/inventory-effect-plans.ts`  
**Estimated scope:** Small

---

### Task B3: Materialize plans from descriptions

**Description:** At the catalog adapter, convert recognized clauses/conditions into the B1 plan representation using existing parser logic. Keep description text for display.

**Acceptance criteria:**
- [ ] Compose steps preserve the current clause order and inherited-target behavior
- [ ] Conditional plans preserve each parsed condition and consequent step
- [ ] Unparseable text remains explicitly unresolved, never silently omitted

**Verification:**
- [ ] Parser tests for compound, conditional, target inheritance, and unresolved text
- [ ] Golden cases from `verify-resolution-order.ts`

**Dependencies:** B1 contract; can run parallel with B4 against that contract  
**Files likely touched:** `src/lib/effectTextNormalize.ts` or a focused materializer module  
**Estimated scope:** Medium

---

### Task B4: Serialize and validate conditions

**Description:** Add a JSON-safe codec for the existing `Condition` union so materialized conditions evaluate with the existing condition evaluator.

**Acceptance criteria:**
- [ ] Round-trip each `parseCondition` kind in deterministic tests
- [ ] Invalid serialized condition is rejected before execution

**Verification:**
- [ ] `src/lib/effectCondition.test.ts`

**Dependencies:** B1; can run parallel with B3 against the agreed condition shape  
**Files likely touched:** `src/lib/effectCondition.ts`, tests  
**Estimated scope:** Small–Medium

---

### Task B5: Emit plans from catalog build

**Description:** When `buildCardCatalog.ts` infers an executable support effect, emit a sibling `supportEffect.effectPlan` field and regenerate the derived card catalog.

**Acceptance criteria:**
- [ ] Every inferred compose/conditional card has a valid plan preserving all clauses
- [ ] Plan output is deterministic across repeated builds

**Verification:**
- [ ] `pnpm cards:build`
- [ ] B2 inventory confirms coverage and stable output

**Dependencies:** B3, B4  
**Files likely touched:** `scripts/buildCardCatalog.ts`, `src/data/cards.json`  
**Estimated scope:** Medium

---

### Task B6: Normalize and validate plans

**Description:** Add `effectPlan` to normalized support-effect data and validate generated plan data in `cardCatalogLoader`.

**Acceptance criteria:**
- [ ] `loadCardCatalog(cardsData)` preserves plans on option and Digimon support entries
- [ ] Invalid plan fails with card ID and reason

**Verification:**
- [ ] Loader tests for a valid plan and malformed plan
- [ ] `pnpm test`

**Dependencies:** B1, B5  
**Files likely touched:** `src/lib/cardCatalogLoader.ts`  
**Estimated scope:** Small–Medium

---

### Task B7: Execute normalized plans (dual-read)

**Description:** Dispatch a validated plan from `SupportEffectSchema.effectPlanJson`; keep current description parsing only as a temporary fallback for old catalog records.

**Acceptance criteria:**
- [ ] Exact state changes match existing behavior for golden compose/conditional cards
- [ ] Plan execution preserves runtime conditions, priority, and operation order

**Verification:**
- [ ] `src/lib/supportPrimitives.test.ts`
- [ ] `pnpm exec tsx scripts/verify-resolution-order.ts`

**Dependencies:** B6  
**Files likely touched:** `src/lib/supportResolver.ts`, tests  
**Estimated scope:** Medium

---

### Task B8: Option path carries the plan

**Description:** `optionResolver.toSupportEffect` copies a validated normalized plan into the support-effect payload; retain prose inference only for pre-migration cards.

**Acceptance criteria:**
- [ ] Catalog-backed Option plan reaches the shared dispatcher intact
- [ ] Unsupported/unresolved text still reports unresolved, not a silent no-op

**Verification:**
- [ ] `src/lib/optionDispatch.test.ts`
- [ ] `pnpm exec tsx scripts/verify-option-dispatch.ts`

**Dependencies:** B7  
**Files likely touched:** `src/lib/optionResolver.ts`  
**Estimated scope:** Small

---

### Task B9: Forward plans through BattleRoom

**Description:** Map normalized `effectPlan` to `SupportEffectSchema.effectPlanJson` and preserve it through Option and Digimon support resolution.

**Acceptance criteria:**
- [ ] No plan is dropped between catalog load, schema serialization, and resolver input
- [ ] Existing card behavior and user-visible support descriptions remain unchanged

**Verification:**
- [ ] Real `BattleRoom` test resolves one catalog Option and one Digimon support plan

**Dependencies:** B6–B8  
**Files likely touched:** `src/schema/BattleState.ts`, `src/rooms/BattleRoom.ts`, room tests  
**Estimated scope:** Medium
---


### Task B10: Parser expansion tranche

**Description:** Pick highest-impact remaining `catalog_text` from B2 inventory; extend `inferSupportEffectFromDescription` / compound splitter; regen catalog.

**Acceptance criteria:**
- [ ] Documented list of card ids fixed in this tranche
- [ ] `catalog_text` count decreases measurably

**Verification:**
- [ ] B2 inventory
- [ ] New parser tests per card pattern

**Dependencies:** B5  
**Files likely touched:** `src/lib/effectTextNormalize.ts`, `scripts/buildCardCatalog.ts`, `cards.json`  
**Estimated scope:** Medium (repeatable tranche — may split B10a/B10b if list is long)

---

### Task B11: Update specialty-gate verifier

**Description:** If plans materialize gates (`requireType`), adjust `verify-specialty-gates.ts` so it does not require description re-parse for gated compose/conditional.

**Acceptance criteria:**
- [ ] Verifier passes with plan-first cards
- [ ] Exemptions for `EVALUATES_DESCRIPTION` shrink or are documented

**Verification:**
- [ ] `pnpm exec tsx scripts/verify-specialty-gates.ts`

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

**Acceptance criteria:**
- [ ] Assert exact strike damage for additive, multiplier, targeted-zero, and conditional Option examples, with a slot/gate control
- [ ] SnowAgumon `067` Cross vs Cross yields no canceled opponent strike and preserves target HP
- [ ] Compound tests prove every clause, not merely one state mutation

**Verification:**
- [ ] `pnpm test src/rooms/BattleRoom.test.ts`
- [ ] `pnpm exec tsx scripts/verify-option-dispatch.ts`

**Dependencies:** B7–B9  
**Files likely touched:** `src/rooms/BattleRoom.test.ts`  
**Estimated scope:** Small

---

