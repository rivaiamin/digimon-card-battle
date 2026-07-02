/**
 * Structured battle audit events for replay and AI review (E2 / E8).
 */

export type AuditValidation = "ok" | "rejected";

export interface PlayerStateSnapshot {
    sessionId: string;
    hp: number;
    score: number;
    dp: number;
    handSize: number;
    deckSize: number;
    hasActive: boolean;
}

export interface StateDelta {
    phase?: string;
    prepSubPhase?: string;
    hp?: number;
    score?: number;
    dp?: number;
    handSize?: number;
    deckSize?: number;
    message?: string;
}

export interface BattleAuditEntry {
    seq: number;
    ts: number;
    turn: number;
    phase: string;
    prepSubPhase: string;
    playerSessionId: string;
    action: string;
    validation: AuditValidation;
    reason?: string;
    fidelityIds?: string[];
    cardIds?: string[];
    dpBefore?: number;
    dpAfter?: number;
    handSize?: number;
    deckSize?: number;
    stateDelta?: StateDelta;
    detail?: Record<string, unknown>;
}

export type BattleAuditEmit = Omit<BattleAuditEntry, "seq" | "ts">;

export class BattleAuditLog {
    private entries: BattleAuditEntry[] = [];
    private seq = 0;
    private replaySeed?: number;

    /** Use synthetic monotonic timestamps for deterministic replay export. */
    setReplayMode(seed: number) {
        this.replaySeed = seed;
    }

    emit(entry: BattleAuditEmit): BattleAuditEntry {
        this.seq += 1;
        const ts = this.replaySeed != null ? this.seq : Date.now();
        const full: BattleAuditEntry = { ...entry, seq: this.seq, ts };
        this.entries.push(full);
        if (process.env.DEBUG_BATTLE_ROOM !== "0") {
            console.log("[BattleAudit]", JSON.stringify(full));
        }
        return full;
    }

    getEntries(): readonly BattleAuditEntry[] {
        return this.entries;
    }

    getEntriesForTurn(turn: number): BattleAuditEntry[] {
        return this.entries.filter(e => e.turn === turn);
    }

    getEntriesForFidelityId(fidelityId: string): BattleAuditEntry[] {
        return this.entries.filter(e => e.fidelityIds?.includes(fidelityId));
    }

    exportJson(): string {
        return JSON.stringify(
            {
                version: 1,
                seed: this.replaySeed,
                entryCount: this.entries.length,
                entries: this.entries,
            },
            null,
            2
        );
    }

    clear() {
        this.entries = [];
        this.seq = 0;
    }
}

export function snapshotPlayer(player: {
    sessionId: string;
    hp: number;
    score: number;
    dp: number;
    hand: { length: number };
    deck: { length: number };
    active: unknown;
}): PlayerStateSnapshot {
    return {
        sessionId: player.sessionId,
        hp: player.hp,
        score: player.score,
        dp: player.dp,
        handSize: player.hand.length,
        deckSize: player.deck.length,
        hasActive: !!player.active,
    };
}
