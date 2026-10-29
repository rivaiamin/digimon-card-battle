# Fidelity battle (PS1 rules)

Server-authoritative Digimon Card Battle match flow: prep, battle band, resolution, and match outcome. Colyseus syncs state; rules live in `src/lib`.

## Language

**Battle session**:
In-memory rules over `BattleStateSchema` (and related schemas), without Colyseus networking or wall-clock timers.
_Avoid_: Battle service, game manager

**Fidelity battle session**:
The `FidelityBattleSession` module: authoritative draw/prep dispatch, phase timeouts, battle presentation steps, turn handoff, and battle-band rules over synced schema state.
_Avoid_: BattleRoom logic (that name is the network adapter)

**Battle band**:
Phases from attack selection through combat resolution: `battle_attack` → `battle_support` → `battle_reveal` → `battle_effects` → `resolution` (including strike resolution and KO scoring).
_Avoid_: Battle phase (ambiguous with entire turn)

**Effect plan**:
Versioned, build-time-normalized executable tree (`effectPlan` / `effectPlanJson`) for support and option effects; runtime does not re-parse card prose for plan-backed effects.
_Avoid_: Effect AST (internal shape name only in code)

**Player action**:
A client `onMessage("action")` payload type (`PlayerActionType` in `battleTurnFlow.ts`) validated before mutating state.
_Avoid_: Command, message handler
