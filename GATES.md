# Gates: Fidelity battle session slice 8 (BattleRoom hygiene)

OWNS: src/rooms/BattleRoom.ts, scripts/verify-battle-room-hygiene.mjs, src/lib/fidelityBattleSession.ts, src/lib/fidelityBattleSession.test.ts, scripts/verify-fidelity-battle-session-gates.mjs, GATES.md

Scope: Prep handoff (`finishPrepOrPassTurn`) and battle entry timer clears live on `FidelityBattleSession`; `BattleRoom` stays adapter-only (no stray rule imports / lock helpers). Hygiene script guards the room file.

- [x] G1: Hygiene script, typecheck, and session tests pass
  CHECK: node scripts/verify-fidelity-battle-session-gates.mjs
  EXPECT: fidelity battle session gates passed
  EVIDENCE: battle room hygiene + lint + vitest (lifecycle, session, BattleRoom) + option-dispatch G3

## Slice history

- Slice 4: timeouts + presentation + turn handoff (session seam; room clocks).
- Slice 5: `PhaseTimeoutPort` tests — strike short-circuit, draw, battle_attack random lock, battle_support no-support reveal.
- Slice 6: presentation invariants — reveal → effects? → resolution → `completeResolutionPresentation`; PS1 vs legacy profiles; reveal commits forward nested presentation.
- Slice 7: match lifecycle — `validateClientJoin`, `startMatch`, `applyMatchEnd`, coin-flip first player; room delegates `startGame` / `endGame` / leave forfeit.
- Slice 8: room hygiene — `finishPrepOrPassTurn` on session, `clearBattlePresentationTimers` hook, dead room rule helpers removed, `verify-battle-room-hygiene.mjs`.
