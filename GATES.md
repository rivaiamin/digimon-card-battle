# Gates: Fidelity battle session slice 5 (PhaseTimeoutPort without Colyseus)

OWNS: src/lib/fidelityBattleSession.ts, src/lib/fidelityBattleSession.test.ts, src/rooms/BattleRoom.ts, scripts/verify-fidelity-battle-session-gates.mjs, GATES.md

Scope: `handlePhaseTimeout` and `PhaseTimeoutPort` are exercised in vitest with fake ports (audit + strike); draw/prep/battle auto-commit rules stay in `FidelityBattleSession`; `BattleRoom` only wires strikes/forfeit.

- [x] G1: Typecheck and session tests pass with timeout/presentation on the session seam
  CHECK: node scripts/verify-fidelity-battle-session-gates.mjs
  EXPECT: fidelity battle session gates passed
  EVIDENCE: lint + vitest (fidelityBattleSession + BattleRoom) + option-dispatch G3

## Slice history

- Slice 4: timeouts + presentation + turn handoff (session seam; room clocks).
- Slice 5: `PhaseTimeoutPort` tests — strike short-circuit, draw, battle_attack random lock, battle_support no-support reveal.
