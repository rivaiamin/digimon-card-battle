import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MULLIGAN_CARD_HIGHLIGHT_MS, MULLIGAN_REDRAW_MS } from "../lib/battleTurnFlow";

export type MulliganOverlayMode = "idle" | "choose" | "redrawing" | "landed" | "opponent";

type MulliganBeat = {
    isMulliganPhase: boolean;
    newlyMulliganedCardIds: ReadonlySet<string>;
    overlayVisible: boolean;
    overlayMode: MulliganOverlayMode;
    cardsLanded: number;
    isRedrawing: boolean;
};

export function useMulliganBeat(
    phase: string,
    prepSubPhase: string,
    isPlayerTurn: boolean,
    handCardIds: readonly string[],
    mulliganRequestTick: number
): MulliganBeat {
    const [isRedrawing, setIsRedrawing] = useState(false);
    const [landingTick, setLandingTick] = useState(0);

    const preMulliganHandRef = useRef<readonly string[]>([]);
    const handCardIdsRef = useRef(handCardIds);
    handCardIdsRef.current = handCardIds;

    const awaitingMulliganRef = useRef(false);
    const landingIdsRef = useRef<readonly string[]>([]);
    const landingExpiryRef = useRef(0);
    const prevHandSigRef = useRef("");
    const prevRequestTickRef = useRef(0);

    const redrawTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handSig = handCardIds.join("|");
    const isMulliganPhase = phase === "preparation" && prepSubPhase === "mulligan";

    const clearRedrawTimer = useCallback(() => {
        if (redrawTimerRef.current) {
            clearTimeout(redrawTimerRef.current);
            redrawTimerRef.current = null;
        }
    }, []);

    const clearHighlightTimer = useCallback(() => {
        if (highlightTimerRef.current) {
            clearTimeout(highlightTimerRef.current);
            highlightTimerRef.current = null;
        }
    }, []);

    if (mulliganRequestTick !== prevRequestTickRef.current) {
        prevRequestTickRef.current = mulliganRequestTick;
        preMulliganHandRef.current = handCardIdsRef.current;
        awaitingMulliganRef.current = true;
        setIsRedrawing(true);
    }

    if (handSig !== prevHandSigRef.current) {
        const before = new Set(preMulliganHandRef.current);
        const added = handCardIds.filter(id => !before.has(id));
        if (
            added.length > 0 &&
            awaitingMulliganRef.current &&
            (isMulliganPhase || phase === "preparation")
        ) {
            landingIdsRef.current =
                added.length >= handCardIds.length ? [...handCardIds] : added;
            landingExpiryRef.current = performance.now() + MULLIGAN_CARD_HIGHLIGHT_MS;
            awaitingMulliganRef.current = false;
            setIsRedrawing(false);
            clearRedrawTimer();
        }
        prevHandSigRef.current = handSig;
    }

    useEffect(() => {
        if (mulliganRequestTick === 0) return;
        clearRedrawTimer();
        redrawTimerRef.current = setTimeout(() => {
            redrawTimerRef.current = null;
            if (awaitingMulliganRef.current) {
                setIsRedrawing(false);
            }
        }, MULLIGAN_REDRAW_MS);
        return clearRedrawTimer;
    }, [mulliganRequestTick, clearRedrawTimer]);

    const newlyMulliganedCardIds = useMemo(() => {
        if (landingIdsRef.current.length === 0) return new Set<string>();
        if (performance.now() > landingExpiryRef.current) return new Set<string>();
        return new Set(landingIdsRef.current);
    }, [handSig, landingTick]);

    useEffect(() => {
        if (newlyMulliganedCardIds.size === 0) return;
        clearHighlightTimer();
        const remaining = Math.max(0, landingExpiryRef.current - performance.now());
        highlightTimerRef.current = setTimeout(() => {
            highlightTimerRef.current = null;
            landingIdsRef.current = [];
            landingExpiryRef.current = 0;
            setLandingTick(t => t + 1);
        }, remaining);
        return clearHighlightTimer;
    }, [handSig, newlyMulliganedCardIds.size, clearHighlightTimer]);

    useEffect(() => {
        if (isMulliganPhase) return;
        if (newlyMulliganedCardIds.size > 0) return;
        awaitingMulliganRef.current = false;
        setIsRedrawing(false);
        clearRedrawTimer();
    }, [isMulliganPhase, newlyMulliganedCardIds.size, clearRedrawTimer]);

    const hasLanding = newlyMulliganedCardIds.size > 0;
    let overlayMode: MulliganOverlayMode = "idle";
    if (hasLanding) {
        overlayMode = "landed";
    } else if (isMulliganPhase && !isPlayerTurn) {
        overlayMode = "opponent";
    } else if (isRedrawing) {
        overlayMode = "redrawing";
    } else if (isMulliganPhase && isPlayerTurn) {
        overlayMode = "choose";
    }

    const overlayVisible =
        isMulliganPhase || hasLanding || (isRedrawing && overlayMode === "redrawing");

    return {
        isMulliganPhase,
        newlyMulliganedCardIds,
        overlayVisible,
        overlayMode,
        cardsLanded: newlyMulliganedCardIds.size,
        isRedrawing,
    };
}
