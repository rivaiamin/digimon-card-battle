# Gates: Fidelity battle session slice 6 (presentation invariants)

OWNS: src/lib/fidelityBattleSession.ts, src/lib/fidelityBattleSession.test.ts, src/rooms/BattleRoom.ts, scripts/verify-fidelity-battle-session-gates.mjs, GATES.md

Scope: Battle presentation ordering is tested on the session seam (attack-first vs support-first); `finishSupportRevealAndAdvance` forwards `schedule_resolution` to the room; `BattleRoom.applyPresentationAdvance` remains the single timer path.

- [x] G1: Typecheck and session tests pass with timeout/presentation on the session seam
  CHECK: node scripts/verify-fidelity-battle-session-gates.mjs
  EXPECT: fidelity battle session gates passed
  EVIDENCE: lint + vitest (fidelityBattleSession + BattleRoom) + option-dispatch G3

## Slice history

- Slice 4: timeouts + presentation + turn handoff (session seam; room clocks).
- Slice 5: `PhaseTimeoutPort` tests — strike short-circuit, draw, battle_attack random lock, battle_support no-support reveal.
- Slice 6: presentation invariants — reveal → effects? → resolution → `completeResolutionPresentation`; PS1 vs legacy profiles; reveal commits forward nested presentation.
