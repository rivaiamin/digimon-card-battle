# Handoff: Fidelity battle session (BattleRoom deepening)

**Branch:** `fix/card-effect-resolution`  
**Status:** Slices 1–8 (slice 8: BattleRoom hygiene — prep handoff on session, room deletion gate).  
**Verify before any follow-up:** `node scripts/verify-fidelity-battle-session-gates.mjs`

## What changed (reader’s map)

| Layer | Module | Responsibility |
|--------|--------|----------------|
| **Deep rules** | `src/lib/fidelityBattleSession.ts` | All authoritative mutations on `BattleStateSchema`: prep, `dispatch(PlayerActionType)`, battle band, phase timeouts, presentation *steps*, turn handoff, KO redeploy queue, `startMatch` / `applyMatchEnd`. |
| **Lifecycle (pure)** | `src/lib/fidelityMatchLifecycle.ts` | Join option validation, join deck id resolution, first-player coin flip, victory copy. |
| **Adapter** | `src/rooms/BattleRoom.ts` | Colyseus lifecycle, `clock` timers, AFK strikes/forfeit, Firebase `onAuth`, audit wiring, `applyPresentationAdvance` (maps `PresentationAdvanceResult` → `setTimeout`). |
| **Vocabulary** | `GLOSSARY.md` | **Fidelity battle session** vs **Battle room** (network adapter); **battle band**; **player action**. |
| **Gate** | `GATES.md` | Slice 4 scope + G1 check (lint, vitest, option-dispatch G3). |

### Slice checklist (done)

1. **Battle band** — support/attack lock, reveal, effects, resolution, `BattleBandOutcome` (match end, deck out, turn complete, ko redeploy).
2. **Prep evolution / deploy** — `evolve`, `deployDigimon`, deck recovery helpers; option-dispatch G3 uses session hooks.
3. **Draw + dispatch** — `executeDrawPhase`, prep sub-phases, full `dispatch()` over `PlayerActionType`; room routes `onMessage("action")` through session.
4. **Timeouts + presentation + turn handoff** — `handlePhaseTimeout(phaseKey, port)`, `afterLockSupport` / `afterLockAttack`, `handoffTurnAfterBattle` / `passActiveTurn` / `enterDrawPhase`; dispatch may return `{ presentation }`.
5. **Match lifecycle** — `fidelityMatchLifecycle.ts`, `startMatch`, `applyMatchEnd`, coin-flip first player.
6. **BattleRoom hygiene** — `finishPrepOrPassTurn`, `verify-battle-room-hygiene.mjs`, adapter-only room (no stray rule imports).

## Key seams (for the next session)

### `FidelityBattleSessionHooks`

Room implements: `emitAudit`, `auditPlayer`, `syncPhaseTimer`, `clearPhaseTimer`, `prepMessageFor`, `shuffleInPlace`, `endGame`, `clearBattlePresentationTimers`.  
**Rule:** No `clock` or `Date.now()` inside the session module; wall time stays in the room.

### `PhaseTimeoutPort`

```ts
{ auditTimeout(sessionIds, autoCommit), applyStrike(sessionId) => boolean }
```

Strikes and AFK forfeit remain in `BattleRoom`; session only calls the port and applies game rules.

### `PresentationAdvanceResult`

Kinds: `idle` | `schedule_reveal` | `schedule_effects` | `schedule_resolution` | `sync_timer` | `outcome`.  
Single room helper: `applyPresentationAdvance()` — do not add parallel timer paths in the room.

### `DispatchResult`

`{ ok, koOutcome?, presentation? }` — room uses `applyDispatchFollowUp()` after `dispatch` (and gamble shortcut).

## Commits (newest first)

```
cdfe7e8 docs(fidelity): record battle session gates and glossary
023a70a chore(verify): extend option-dispatch fidelity session hooks
1e897d0 refactor(battle): thin BattleRoom through fidelity session
eb7ea11 test(fidelity): add session tests and gate verifier
8a75f02 feat(fidelity): add FidelityBattleSession module
```

## Suggested slice 8+ (not started)

Pick one vertical; extend `GATES.md` and `fidelityBattleSession.test.ts` when you deepen the seam.

1. ~~**Match lifecycle**~~ — done in slice 7 (`fidelityMatchLifecycle.ts`, `startMatch`, `applyMatchEnd`, coin-flip active player; room keeps auth/reconnect).
2. ~~**AFK / timeout tests without Colyseus**~~ — done in slice 5 (`handlePhaseTimeout` + fake `PhaseTimeoutPort`).
3. ~~**Presentation invariants**~~ — done in slice 6 (session tests + `RevealCommitResult.presentation` forward to room).
4. ~~**Room deletion test**~~ — done in slice 8 (`verify-battle-room-hygiene.mjs`, `finishPrepOrPassTurn` on session, stale imports/helpers removed from room).
5. **Client / FC coverage** — map new session paths to `docs/8.0 Fidelity Checklist & Epic Backlog.md` items; add FC-tagged audits where gaps remain.

## Files to open first

- `src/lib/fidelityBattleSession.ts` — `dispatch`, `handlePhaseTimeout`, `finishSupportRevealAndAdvance`, `maybeResolveBattle`
- `src/rooms/BattleRoom.ts` — `initFidelitySession`, `dispatchClientAction`, `onPhaseTimeout`, `applyPresentationAdvance`
- `src/lib/fidelityBattleSession.test.ts` — pattern for hook-only session tests
- `src/lib/battleTurnFlow.ts` — `PlayerActionType`, timer constants (`SUPPORT_REVEAL_MS`, etc.)

## Anti-patterns (avoid re-shallowing the room)

- Duplicating timeout auto-commit or random attack pick in `BattleRoom`.
- Calling `fidelitySession.lockSupport` from the room without going through `dispatch` or `handlePhaseTimeout` (breaks presentation chaining).
- Adding rule branches in `onMessage` instead of extending `dispatch` or a dedicated session method.

## Push / PR note

Commits are local on `fix/card-effect-resolution`; push when ready. No ADR was added for “session owns rules, room owns clock” — add under `docs/adr/` if you want architecture review to stop re-suggesting moving timers into the session.
