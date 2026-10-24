# Gates: Fidelity battle session slice 4 (timeouts + presentation + turn handoff)

OWNS: src/lib/fidelityBattleSession.ts, src/lib/fidelityBattleSession.test.ts, src/rooms/BattleRoom.ts, scripts/verify-fidelity-battle-session-gates.mjs, GATES.md

Scope: Phase timeouts (draw/prep/battle auto-commit), battle presentation scheduling, and post-battle turn handoff live in `FidelityBattleSession`; `BattleRoom` owns Colyseus clocks and AFK strikes only.

- [x] G1: Typecheck and session tests pass with timeout/presentation on the session seam
  CHECK: node scripts/verify-fidelity-battle-session-gates.mjs
  EXPECT: fidelity battle session gates passed
  EVIDENCE: lint + vitest (fidelityBattleSession + BattleRoom) + option-dispatch G3
