# Gates: Fidelity battle session slice 7 (match lifecycle)

OWNS: src/lib/fidelityMatchLifecycle.ts, src/lib/fidelityMatchLifecycle.test.ts, src/lib/fidelityBattleSession.ts, src/lib/fidelityBattleSession.test.ts, src/rooms/BattleRoom.ts, scripts/verify-fidelity-battle-session-gates.mjs, GATES.md

Scope: Join validation, deck id resolution, first-player coin flip, `startMatch`, `applyMatchEnd`, and permanent-leave forfeit decisions live on the session / lifecycle modules; `BattleRoom` keeps Colyseus auth, reconnection, and timer teardown.

- [x] G1: Typecheck and session tests pass with timeout/presentation on the session seam
  CHECK: node scripts/verify-fidelity-battle-session-gates.mjs
  EXPECT: fidelity battle session gates passed
  EVIDENCE: lint + vitest (fidelityBattleSession + BattleRoom) + option-dispatch G3

## Slice history

- Slice 4: timeouts + presentation + turn handoff (session seam; room clocks).
- Slice 5: `PhaseTimeoutPort` tests — strike short-circuit, draw, battle_attack random lock, battle_support no-support reveal.
- Slice 6: presentation invariants — reveal → effects? → resolution → `completeResolutionPresentation`; PS1 vs legacy profiles; reveal commits forward nested presentation.
- Slice 7: match lifecycle — `validateClientJoin`, `startMatch`, `applyMatchEnd`, coin-flip first player; room delegates `startGame` / `endGame` / leave forfeit.
