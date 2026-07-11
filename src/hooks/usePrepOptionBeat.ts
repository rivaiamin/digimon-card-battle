import { useEffect, useMemo, useRef, useState } from "react";
import {
    formatPrepOptionFeedback,
    type PrepOptionCardView,
} from "../lib/prepOptionPresentation";
import { PREP_OPTION_FEEDBACK_MS } from "../lib/battleTurnFlow";

export type PrepOptionPlayRequest = {
    cardId: string;
    effectId: string;
    effectArgs?: PrepOptionCardView["effectArgs"];
    name?: string;
};

type PrepOptionBeat = {
    overlayVisible: boolean;
    feedback: string | null;
};

export function usePrepOptionBeat(
    phase: string,
    prepSubPhase: string,
    isPlayerTurn: boolean,
    playerDp: number,
    playerHp: number,
    handCardIds: readonly string[],
    playRequest: PrepOptionPlayRequest | null,
    playRequestTick: number
): PrepOptionBeat {
    const [tick, setTick] = useState(0);

    const pendingRef = useRef<
        (PrepOptionPlayRequest & { dpBefore: number; hpBefore: number; handBefore: number }) | null
    >(null);
    const feedbackRef = useRef<string | null>(null);
    const feedbackExpiryRef = useRef(0);
    const prevTickRef = useRef(0);

    const isPrepOptionPhase =
        phase === "preparation" && (prepSubPhase === "discard" || prepSubPhase === "evolve");

    if (playRequest && playRequestTick !== prevTickRef.current) {
        prevTickRef.current = playRequestTick;
        pendingRef.current = {
            ...playRequest,
            dpBefore: playerDp,
            hpBefore: playerHp,
            handBefore: handCardIds.length,
        };
    }

    if (pendingRef.current && !handCardIds.includes(pendingRef.current.cardId)) {
        const pending = pendingRef.current;
        const dpGain = Math.max(0, playerDp - pending.dpBefore);
        const hpGain = Math.max(0, playerHp - pending.hpBefore);
        const cardsDrawn = Math.max(0, handCardIds.length - pending.handBefore + 1);
        feedbackRef.current = formatPrepOptionFeedback(pending, { dpGain, hpGain, cardsDrawn });
        feedbackExpiryRef.current = performance.now() + PREP_OPTION_FEEDBACK_MS;
        pendingRef.current = null;
        setTick(t => t + 1);
    }

    const feedback = useMemo(() => {
        if (performance.now() > feedbackExpiryRef.current) return null;
        return feedbackRef.current;
    }, [tick, playerDp, playerHp, handCardIds.length]);

    useEffect(() => {
        if (!feedback) return;
        const remaining = Math.max(0, feedbackExpiryRef.current - performance.now());
        const timer = setTimeout(() => setTick(t => t + 1), remaining + 16);
        return () => clearTimeout(timer);
    }, [feedback, tick]);

    useEffect(() => {
        if (isPrepOptionPhase) return;
        pendingRef.current = null;
        feedbackRef.current = null;
        feedbackExpiryRef.current = 0;
    }, [isPrepOptionPhase]);

    const overlayVisible =
        isPrepOptionPhase || (feedback !== null && performance.now() <= feedbackExpiryRef.current);

    return {
        overlayVisible,
        feedback,
    };
}
