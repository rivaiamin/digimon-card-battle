import { useEffect, useMemo, useRef, useState } from "react";
import { DISCARD_DP_GAIN_MS } from "../lib/battleTurnFlow";

type DiscardDpBeat = {
    overlayVisible: boolean;
    lastDpGain: number;
    playerDp: number;
};

export function useDiscardDpBeat(
    phase: string,
    prepSubPhase: string,
    isPlayerTurn: boolean,
    playerDp: number,
    handCardIds: readonly string[]
): DiscardDpBeat {
    const [tick, setTick] = useState(0);

    const prevDpRef = useRef(playerDp);
    const prevHandLenRef = useRef(handCardIds.length);
    const lastGainRef = useRef(0);
    const gainExpiryRef = useRef(0);

    const isDiscardPhase = phase === "preparation" && prepSubPhase === "discard";

    if (isDiscardPhase && isPlayerTurn) {
        const handShrunk = handCardIds.length < prevHandLenRef.current;
        const dpIncreased = playerDp > prevDpRef.current;
        if (handShrunk && dpIncreased) {
            lastGainRef.current = playerDp - prevDpRef.current;
            gainExpiryRef.current = performance.now() + DISCARD_DP_GAIN_MS;
            setTick(t => t + 1);
        }
        prevDpRef.current = playerDp;
        prevHandLenRef.current = handCardIds.length;
    } else {
        prevDpRef.current = playerDp;
        prevHandLenRef.current = handCardIds.length;
        if (!isDiscardPhase) {
            lastGainRef.current = 0;
            gainExpiryRef.current = 0;
        }
    }

    const lastDpGain = useMemo(() => {
        if (performance.now() > gainExpiryRef.current) return 0;
        return lastGainRef.current;
    }, [tick, playerDp, handCardIds.length]);

    useEffect(() => {
        if (lastDpGain <= 0) return;
        const remaining = Math.max(0, gainExpiryRef.current - performance.now());
        const timer = setTimeout(() => setTick(t => t + 1), remaining + 16);
        return () => clearTimeout(timer);
    }, [lastDpGain, tick]);

    const overlayVisible = isDiscardPhase || lastDpGain > 0;

    return {
        overlayVisible,
        lastDpGain,
        playerDp,
    };
}
