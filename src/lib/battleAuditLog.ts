/**
 * Structured prep-phase audit events for replay and AI review (E2 / T2-4).
 */

export type AuditValidation = "ok" | "rejected";

export interface BattleAuditEntry {
    ts: number;
    turn: number;
    phase: string;
    prepSubPhase: string;
    playerSessionId: string;
    action: string;
    validation: AuditValidation;
    reason?: string;
    cardIds?: string[];
    dpBefore?: number;
    dpAfter?: number;
    handSize?: number;
    deckSize?: number;
    detail?: Record<string, unknown>;
}

export class BattleAuditLog {
    private entries: BattleAuditEntry[] = [];

    emit(entry: Omit<BattleAuditEntry, "ts">): BattleAuditEntry {
        const full: BattleAuditEntry = { ...entry, ts: Date.now() };
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
}
