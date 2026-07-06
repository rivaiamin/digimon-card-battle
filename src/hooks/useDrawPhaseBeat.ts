import { useCallback, useEffect, useRef, useState } from "react";
import { DRAW_BEAT_MS, DRAW_CARD_HIGHLIGHT_MS } from "../lib/battleTurnFlow";

export type DrawOverlayMode = "idle" | "drawing" | "landing" | "opponent";

type DrawPhaseBeat = {
    isDrawPhase: boolean;
    isBeating: boolean;
    newlyDrawnCardIds: ReadonlySet<string>;
    /** Center/banner overlay visible during draw + card landing. */
    overlayVisible: boolean;
    overlayMode: DrawOverlayMode;
    /** How many cards just arrived (0 during beat before server reply). */
    cardsLanded: number;
};

export function useDrawPhaseBeat(
    phase: string,
    isPlayerTurn: boolean,
    handCardIds: readonly string[],
    onCommitDraw: () => void
): DrawPhaseBeat {
    const [isBeating, setIsBeating] = useState(false);
    const [newlyDrawnCardIds, setNewlyDrawnCardIds] = useState<ReadonlySet<string>>(
        () => new Set()
    );
    const [cardsLanded, setCardsLanded] = useState(0);

    const preDrawHandRef = useRef<readonly string[]>([]);
    const handCardIdsRef = useRef(handCardIds);
    handCardIdsRef.current = handCardIds;

    const drawScheduledRef = useRef(false);
    const beatTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const highlightTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

    useEffect(() => {
        if (phase !== "draw") {
            drawScheduledRef.current = false;
            setIsBeating(false);
            clearBeatTimer();
            return;
        }

        if (!isPlayerTurn) return;

        if (drawScheduledRef.current) return;

        preDrawHandRef.current = handCardIdsRef.current;
        drawScheduledRef.current = true;
        setCardsLanded(0);
        setIsBeating(true);

        beatTimerRef.current = setTimeout(() => {
            beatTimerRef.current = null;
            setIsBeating(false);
            onCommitDraw();
        }, DRAW_BEAT_MS);

        return clearBeatTimer;
    }, [phase, isPlayerTurn, onCommitDraw, clearBeatTimer]);

    useEffect(() => {
        if (phase !== "draw" && phase !== "preparation") {
            setNewlyDrawnCardIds(new Set());
            setCardsLanded(0);
            clearHighlightTimer();
            return;
        }

        const before = new Set(preDrawHandRef.current);
        const added = handCardIds.filter(id => !before.has(id));
        if (added.length === 0) return;

        setCardsLanded(added.length);
        setNewlyDrawnCardIds(new Set(added));
        clearHighlightTimer();
        highlightTimerRef.current = setTimeout(() => {
            highlightTimerRef.current = null;
            setNewlyDrawnCardIds(new Set());
            setCardsLanded(0);
        }, DRAW_CARD_HIGHLIGHT_MS);

        return clearHighlightTimer;
    }, [phase, handCardIds, clearHighlightTimer]);

    const isDrawPhase = phase === "draw";
    const hasLanding = newlyDrawnCardIds.size > 0;

    let overlayMode: DrawOverlayMode = "idle";
    if (isDrawPhase && !isPlayerTurn) {
        overlayMode = "opponent";
    } else if (hasLanding) {
        overlayMode = "landing";
    } else if (isDrawPhase && isBeating) {
        overlayMode = "drawing";
    } else if (isDrawPhase && isPlayerTurn) {
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
