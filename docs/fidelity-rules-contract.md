# Fidelity Rules Contract (E0 / T0-1)

## 1. Purpose

This document is the authoritative rule contract for gameplay fidelity work.  
Each fidelity checklist item (`FC-001`..`FC-030`) maps to one explicit rule statement with citations.

Primary objective for E0 / T0-1:

- remove rule ambiguity before implementation;
- ensure every checklist item has a written contract and source references.

---

## 2. Citation legend

### Canonical gameplay references

- `MANUAL`: PS1 manual text snapshot: `/home/ubuntu/.cursor/projects/workspace/agent-tools/bca3730f-d2db-4031-a565-46aa85a22373.txt`
- `WIKIMON`: Wikimon gameplay summary snapshot: `/home/ubuntu/.cursor/projects/workspace/agent-tools/06caf3cd-991c-4944-a363-140d0c6a6cdf.txt`

### Project references (current baseline / planned scope)

- `BACKLOG`: `docs/8.0 Fidelity Checklist & Epic Backlog.md`
- `ROOM`: `src/rooms/BattleRoom.ts`
- `SUPPORT`: `src/lib/supportResolver.ts`
- `EVOLVE`: `src/lib/evolutionEligibility.ts`
- `APP`: `src/App.tsx`
- `STATE`: `src/schema/BattleState.ts`
- `CARDS`: `src/data/cards.json`
- `TIMER_SPEC`: `docs/3.1 Turn Timer & Anti-Griefing System.md`
- `NET_SPEC`: `docs/3.0 Multiplayer Networking GDD.md`
- `GDD`: `GDD.md`

---

## 3. Rule contract mapped to FC IDs

| FC ID | Rule statement (authoritative) | Canonical citations | Current baseline citations |
|---|---|---|---|
| FC-001 | Match opening MUST use the canonical opening-hand flow (draw to 4 and redraw/mulligan behavior), not a generic draw-to-6 loop. | `MANUAL` L360-L367; `WIKIMON` L40 | `ROOM` L326-L354, L233-L236 |
| FC-002 | Initial Battle Digimon selection MUST follow canonical opening rules, including non-rookie opening penalties when that mode is enabled. | `MANUAL` L356, L362; `WIKIMON` L42 | `ROOM` L397-L403, L422-L424 |
| FC-003 | Turn flow MUST preserve canonical sequence Draw -> Preparation/Evolution -> Battle with strict server validation of legal transitions. | `MANUAL` L336-L345, L370-L384 | `ROOM` L91-L145, L473-L551 |
| FC-004 | Turn ownership MUST alternate after battle resolution, unless the match has ended. | `MANUAL` L409 | `ROOM` L650-L658, L599-L603 |
| FC-005 | Win/loss conditions MUST include first-to-3 KOs and deck-out semantics as contracted for this project. | `MANUAL` L409; `GDD` L10-L11, L57 | `ROOM` L624-L633, L660-L677, L67-L84 |
| FC-006 | DP generation MUST come from discard actions during preparation timing windows. | `MANUAL` L372-L373; `WIKIMON` L46 | `ROOM` L356-L366 |
| FC-007 | Normal evolution MUST enforce level path, specialty compatibility, and DP cost gates. | `MANUAL` L340, L374; `WIKIMON` L46 | `EVOLVE` L1-L8, L14-L23; `ROOM` L372-L386 |
| FC-008 | Evolution Option cards MUST be executable in authoritative server flow at the proper phase timing. | `MANUAL` L376 | `ROOM` L40-L156 (no option action handlers); `CARDS` L1-L439 (Digimon-only set) |
| FC-009 | Evolution outcome MUST apply post-evolution restoration behavior per selected canonical rule (full-power recovery). | `MANUAL` L378 | `ROOM` L384 |
| FC-010 | Partner / Armor evolution paths MUST be explicitly supported or formally scoped out for v1 with no silent mismatch. | `MANUAL` L128, L368; `WIKIMON` L36 | `EVOLVE` L1-L8 (linear ladder only); `CARDS` L287-L329 (Armor cards present but not in ladder) |
| FC-011 | Attack selection MUST use hidden lock-in and deterministic reveal/resolve sequencing. | `MANUAL` L341, L384; `WIKIMON` L50 | `ROOM` L553-L577, L562-L580 |
| FC-012 | Support card choice order MUST follow canonical attacker/defender ordering (attacking second chooses first). | `MANUAL` L399-L400 | `ROOM` L495-L510 (unordered lock model) |
| FC-013 | Support phase MUST allow hand selection and (if in-scope) online-deck gamble support draw with legal constraints. | `MANUAL` L401-L405; `WIKIMON` L50 | `ROOM` L500-L506 (hand only + none) |
| FC-014 | Support/effect resolution MUST use deterministic speed/priority ordering, with explicit tie-break behavior. | `MANUAL` L413-L417 | `SUPPORT` L14-L23, L259-L263 |
| FC-015 | Nullification/jamming-style effects MUST be represented and resolved at correct timing/scope. | `MANUAL` L389, L413-L417 | `SUPPORT` L5-L12, L160-L162 (void only) |
| FC-016 | Circle/Triangle/Cross base attack characteristics MUST match canonical behavior per card and selection. | `MANUAL` L386; `WIKIMON` L50 | `SUPPORT` L270-L285; `ROOM` L581-L596 |
| FC-017 | Cross special-effect logic MUST support canonical X behavior set (counter/to-0/crash/eat-up HP, etc.) via effect IDs. | `MANUAL` L386-L394; `WIKIMON` L50 | `ROOM` L581-L596 (no X-specific branch engine); `SUPPORT` L151-L212 (limited generic effects) |
| FC-018 | First Attack behavior MUST resolve precedence and cancellation exactly per contract. | `MANUAL` L392, L417 | `SUPPORT` L163-L165; `ROOM` L584-L593 |
| FC-019 | Simultaneous KO / double KO rules MUST be deterministic and match contract (scoring + redeploy behavior). | `GDD` L90-L93 | `ROOM` L616-L621, L624-L633 |
| FC-020 | Conflicting effects MUST resolve through a deterministic conflict policy (priority + tie-break + override rules). | `MANUAL` L413-L417 | `SUPPORT` L69-L74, L259-L263 |
| FC-021 | Phase timers MUST be server-authoritative for all interactive phases. | `TIMER_SPEC` L9-L16, L39-L44 | `ROOM` L22, L529-L532 (reveal delay only); `APP` L31 |
| FC-022 | Timeout auto-commit defaults MUST apply by phase (skip evolution, no support, random attack) unless overridden by mode config. | `TIMER_SPEC` L20-L25, L52-L55 | `ROOM` L40-L156 (no timeout auto-commit handlers) |
| FC-023 | Consecutive inactivity MUST trigger strike accounting and forfeit at configured threshold. | `TIMER_SPEC` L26-L29 | `ROOM` L40-L156 (no AFK strike system) |
| FC-024 | Disconnect/reconnect policy MUST be explicit, fair, and deterministic for ranked multiplayer outcomes. | `NET_SPEC` L5, L15-L22 | `ROOM` L196-L204 (disconnect ends match immediately) |
| FC-025 | Hidden information MUST remain private until reveal gates are satisfied (support/attack anti-leak guarantees). | `NET_SPEC` L19-L22 | `ROOM` L19-L23, L482-L493, L520-L527; `STATE` L51-L60 |
| FC-026 | Card taxonomy MUST represent Digimon, Option, and Evolution card categories in schema/runtime. | `MANUAL` L269-L271; `WIKIMON` L36 | `CARDS` L1-L439 (Digimon-focused data); `STATE` L21-L37 (single card schema type) |
| FC-027 | Effect modeling MUST be normalized into stable effect IDs + arguments (data-driven, not one-off hardcoding). | `BACKLOG` L88; `MANUAL` L413-L417 | `SUPPORT` L5-L12, L95-L140 (partial token parsing) |
| FC-028 | Deck legality MUST enforce canonical constraints (30 cards, duplicate limits, special constraints). | `MANUAL` L427; `WIKIMON` L40 | `ROOM` L290-L313 (auto-generated deck, no player deck validation API) |
| FC-029 | Rule variants (special arenas / mode rules) MUST be configurable as explicit profiles, not hidden ad-hoc code branches. | `BACKLOG` L90; `NET_SPEC` L5-L6 | `ROOM` L27-L31, L290-L313 (single rule path) |
| FC-030 | Fidelity verification MUST include deterministic regression scenarios mapped to FC IDs in CI/replay tooling. | `BACKLOG` L91, L270-L273 | `BACKLOG` L264-L282 (planned only; no implemented scenario harness yet) |

---

## 4. Contract decisions for v1 implementation

1. **Canonical-first mechanics**
   - For gameplay conflicts, manual-driven mechanics win over convenience behavior.

2. **Server authority**
   - Any rule affecting outcome, hidden information, or phase timing must be resolved on the server.

3. **Data-driven effects**
   - New battle mechanics should be added via effect descriptors and resolver pipeline extensions, not hardcoded card-name branches.

4. **Explicit scope flags**
   - If a canonical mechanic is deferred, mark it as deferred in backlog and checklist rather than silently diverging.

---

## 5. Resolved ambiguities (E0 / T0-2)

The following conflicts were resolved for implementation guidance.  
If future primary evidence contradicts a decision, update this section and link the change in the relevant task.

| Ambiguity ID | Ambiguous topic | Conflicting evidence | Decision (resolved) | Impacted FC IDs |
|---|---|---|---|---|
| RA-001 | Opening hand size and refill target | Current server uses draw-to-6; manual/wiki references indicate draw-to-4 opening flow and redraw behavior. | Fidelity profile uses **4-card hand model** for opening and turn-start refill logic. Draw-to-6 is treated as non-fidelity legacy behavior. | FC-001, FC-003, FC-005 |
| RA-002 | Attack/support order inside battle phase | Internal docs historically describe support-then-attack; manual/wiki wording points to attack selection and support sequencing in canonical flow. | Fidelity profile contracts battle as **attack lock then support resolution pipeline**. Any transitional divergence must be tagged as known difference. | FC-011, FC-012, FC-013, FC-014 |
| RA-003 | Support pick order between players | Current implementation uses unordered lock-in; manual states attacking second chooses support first. | Adopt **attacking second chooses support first** in canonical profile. | FC-012, FC-025 |
| RA-004 | Deck-out semantics | Sources describe loss when unable to continue required draw/selection; project currently emphasizes draw shortfall checks. | Deck-out loss is triggered when player cannot satisfy a required progression step (required draw or required legal replacement battler selection). | FC-005, FC-019 |
| RA-005 | Non-rookie opening legality | Current flow enforces rookie deploy; manual describes Level C/U opening with stat penalties. | Canonical profile allows non-rookie opening if selected by rule set, with explicit HP/ATK penalties according to contract values. | FC-002 |
| RA-006 | Effect tie-break order | Current support tie-break uses active player; manual says same-speed effects defer to 1st-attack player. | Tie-break order is: effect speed/priority -> 1st-attack owner (if defined) -> attacking player -> deterministic session order. | FC-014, FC-018, FC-020 |
| RA-007 | Special arena rule restrictions in multiplayer | Some references include PvE arena rule overrides (for example, option restrictions). | Ranked multiplayer baseline excludes PvE arena overrides by default; special rule sets are explicit profile variants. | FC-029 |

### 5.1 Clarifications to avoid hidden scope creep

1. **Profile naming**
   - `fidelity_ps1`: canonical-focused profile for parity work.
   - `legacy_online`: existing behavior profile retained only for transition/testing.

2. **Evidence quality rule**
   - When manual text and derived summaries disagree, manual + replay evidence wins.

3. **Change control**
   - Any future ambiguity resolution must include:
     - impacted FC IDs,
     - migration implications,
     - test scenario IDs to update.

---

## 6. Completion criteria for E0 / T0-1

T0-1 is complete when:

- all `FC-001`..`FC-030` have a written rule statement;
- each statement has at least one citation;
- baseline implementation references are attached for gap tracking.

T0-2 is complete when:

- all active rule conflicts are listed in the resolved ambiguities table;
- each ambiguity has an explicit decision and FC impact mapping;
- ambiguity decisions are implementation-ready (not open-ended notes).

