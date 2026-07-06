import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DRAW_BEAT_MS, DRAW_CARD_HIGHLIGHT_MS } from "../lib/battleTurnFlow";

export type DrawOverlayMode = "idle" | "drawing" | "landing" | "opponent";

type DrawPhaseBeat = {
    isDrawPhase: boolean;
    isBeating: boolean;
    newlyDrawnCardIds: ReadonlySet<string>;
    overlayVisible: boolean;
    overlayMode: DrawOverlayMode;
    cardsLanded: number;
};

export function useDrawPhaseBeat(
    phase: string,
    isPlayerTurn: boolean,
    handCardIds: readonly string[],
    onCommitDraw: () => void
): DrawPhaseBeat {
    const [isBeating, setIsBeating] = useState(false);
    const [landingTick, setLandingTick] = useState(0);

    const preDrawHandRef = useRef<readonly string[]>([]);
    const handCardIdsRef = useRef(handCardIds);
    handCardIdsRef.current = handCardIds;

    const drawScheduledRef = useRef(false);
    const awaitingDrawResultRef = useRef(false);
    const landingIdsRef = useRef<readonly string[]>([]);
    const landingExpiryRef = useRef(0);
    const prevHandSigRef = useRef("");

    const beatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const handSig = handCardIds.join("|");

    const clearBeatTimer = useCallback(() => {
        if (beatTimerRef.current) {
            clearTimeout(beatTimerRef.current);
            beatTimerRef.current = null;
        }
    }, []);

    const clearHighlightTimer = useCallback(() => {
        if (highlightTimerRef.current) {
            clearTimeout(highlightTimerRef.current);
            highlightTimerRef.current = null;
        }
    }, []);

    // Detect landed cards on the same render the hand updates (before paint).
    if (handSig !== prevHandSigRef.current) {
        const before = new Set(preDrawHandRef.current);
        const added = handCardIds.filter(id => !before.has(id));
        if (
            added.length > 0 &&
            awaitingDrawResultRef.current &&
            (phase === "draw" || phase === "preparation")
        ) {
            landingIdsRef.current = added;
            landingExpiryRef.current = performance.now() + DRAW_CARD_HIGHLIGHT_MS;
            awaitingDrawResultRef.current = false;
        } else if (
            phase === "preparation" &&
            awaitingDrawResultRef.current &&
            added.length === 0
        ) {
            awaitingDrawResultRef.current = false;
        }
        prevHandSigRef.current = handSig;
    }

    const newlyDrawnCardIds = useMemo(() => {
        if (landingIdsRef.current.length === 0) return new Set<string>();
        if (performance.now() > landingExpiryRef.current) return new Set<string>();
        return new Set(landingIdsRef.current);
    }, [handSig, landingTick]);

    const cardsLanded = newlyDrawnCardIds.size;

    useEffect(() => {
        if (newlyDrawnCardIds.size === 0) return;
        clearHighlightTimer();
        const remaining = Math.max(0, landingExpiryRef.current - performance.now());
        highlightTimerRef.current = setTimeout(() => {
            highlightTimerRef.current = null;
            landingIdsRef.current = [];
            landingExpiryRef.current = 0;
            setLandingTick(t => t + 1);
        }, remaining);
        return clearHighlightTimer;
    }, [handSig, newlyDrawnCardIds.size, clearHighlightTimer]);

    useEffect(() => {
        if (phase !== "draw" && phase !== "preparation") {
            landingIdsRef.current = [];
            landingExpiryRef.current = 0;
            awaitingDrawResultRef.current = false;
            clearHighlightTimer();
        }
    }, [phase, clearHighlightTimer]);

    useEffect(() => {
        if (phase !== "draw") {
            drawScheduledRef.current = false;
            setIsBeating(false);
            clearBeatTimer();
            return;
        }

        if (!isPlayerTurn || drawScheduledRef.current) return;

        preDrawHandRef.current = handCardIdsRef.current;
        drawScheduledRef.current = true;
        setIsBeating(true);

        beatTimerRef.current = setTimeout(() => {
            beatTimerRef.current = null;
            setIsBeating(false);
            awaitingDrawResultRef.current = true;
            onCommitDraw();
        }, DRAW_BEAT_MS);

        return clearBeatTimer;
    }, [phase, isPlayerTurn, onCommitDraw, clearBeatTimer]);

    const isDrawPhase = phase === "draw";
    const hasLanding = newlyDrawnCardIds.size > 0;

    let overlayMode: DrawOverlayMode = "idle";
    if (isDrawPhase && !isPlayerTurn) {
        overlayMode = "opponent";
    } else if (hasLanding) {
        overlayMode = "landing";
    } else if (isDrawPhase && (isBeating || isPlayerTurn)) {
        overlayMode = "drawing";
    }

    const overlayVisible = isDrawPhase || hasLanding;

    return {
        isDrawPhase,
        isBeating,
        newlyDrawnCardIds,
        overlayVisible,
        overlayMode,
        cardsLanded,
    };
}
