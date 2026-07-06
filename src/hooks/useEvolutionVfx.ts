import { useEffect, useMemo, useRef, useState } from "react";
import {
    EVOLUTION_ENTER_MS,
    EVOLUTION_FLASH_COLOR,
    EVOLUTION_FLASH_MS,
} from "../lib/battleTurnFlow";

export type EvolutionSide = "player" | "opponent";

type FieldSnapshot = {
    activeId: string | null;
    stackLen: number;
};

type FieldEvolutionState = {
    side: EvolutionSide;
    activeId: string;
    until: number;
};

/** True when active digimon changed because of digivolution (not deploy / KO redeploy). */
export function isFieldEvolution(prev: FieldSnapshot, next: FieldSnapshot): boolean {
    return !!(
        prev.activeId &&
        next.activeId &&
        prev.activeId !== next.activeId &&
        next.stackLen > prev.stackLen
    );
}

export type EvolutionVfx = {
    flashColor: string | null;
    label: EvolutionSide | null;
    playerFieldEnter: "default" | "digivolve" | "none";
    opponentFieldEnter: "default" | "digivolve" | "none";
};

export function useEvolutionVfx(
    player: FieldSnapshot,
    opponent: FieldSnapshot,
    onEvolve?: (side: EvolutionSide) => void
): EvolutionVfx {
    const [tick, setTick] = useState(0);

    const prevPlayerRef = useRef<FieldSnapshot>({ activeId: null, stackLen: 0 });
    const prevOpponentRef = useRef<FieldSnapshot>({ activeId: null, stackLen: 0 });

    const evolutionRef = useRef<FieldEvolutionState | null>(null);
    const flashUntilRef = useRef(0);
    const sfxSideRef = useRef<EvolutionSide | null>(null);

    const detectSide = (side: EvolutionSide, prev: FieldSnapshot, next: FieldSnapshot) => {
        if (!isFieldEvolution(prev, next)) return;
        const now = performance.now();
        evolutionRef.current = { side, activeId: next.activeId!, until: now + EVOLUTION_ENTER_MS };
        flashUntilRef.current = now + EVOLUTION_FLASH_MS;
        sfxSideRef.current = side;
        setTick(t => t + 1);
    };

    const prevPlayer = prevPlayerRef.current;
    if (
        player.activeId !== prevPlayer.activeId ||
        player.stackLen !== prevPlayer.stackLen
    ) {
        detectSide("player", prevPlayer, player);
        prevPlayerRef.current = player.activeId
            ? { activeId: player.activeId, stackLen: player.stackLen }
            : { activeId: null, stackLen: 0 };
    }

    const prevOpponent = prevOpponentRef.current;
    if (
        opponent.activeId !== prevOpponent.activeId ||
        opponent.stackLen !== prevOpponent.stackLen
    ) {
        detectSide("opponent", prevOpponent, opponent);
        prevOpponentRef.current = opponent.activeId
            ? { activeId: opponent.activeId, stackLen: opponent.stackLen }
            : { activeId: null, stackLen: 0 };
    }

    useEffect(() => {
        const side = sfxSideRef.current;
        if (!side) return;
        sfxSideRef.current = null;
        onEvolve?.(side);
    }, [tick, onEvolve]);

    const now = performance.now();
    const evolution = evolutionRef.current;
    const evolutionActive =
        evolution && now < evolution.until ? evolution : null;

    const flashColor = useMemo(() => {
        if (now > flashUntilRef.current) return null;
        return EVOLUTION_FLASH_COLOR;
    }, [tick, player.activeId, opponent.activeId]);

    useEffect(() => {
        if (!evolutionActive) return;
        const remaining = evolutionActive.until - performance.now();
        if (remaining <= 0) return;
        const timer = setTimeout(() => setTick(t => t + 1), remaining + 16);
        return () => clearTimeout(timer);
    }, [evolutionActive?.side, evolutionActive?.activeId, evolutionActive?.until]);

    useEffect(() => {
        if (flashUntilRef.current <= performance.now()) return;
        const remaining = flashUntilRef.current - performance.now();
        const timer = setTimeout(() => setTick(t => t + 1), remaining + 16);
        return () => clearTimeout(timer);
    }, [tick]);

    const playerFieldEnter =
        evolutionActive?.side === "player" && evolutionActive.activeId === player.activeId
            ? "digivolve"
            : "default";
    const opponentFieldEnter =
        evolutionActive?.side === "opponent" && evolutionActive.activeId === opponent.activeId
            ? "digivolve"
            : "default";

    return {
        flashColor,
        label: evolutionActive?.side ?? null,
        playerFieldEnter,
        opponentFieldEnter,
    };
}
