import { useEffect, useState } from "react";

/** True when the server phase timer is in the last 5 seconds (TIMER_SPEC critical zone). */
export function usePhaseTimerCritical(phaseEndsAtMs?: number): boolean {
    const [critical, setCritical] = useState(false);

    useEffect(() => {
        if (!phaseEndsAtMs || phaseEndsAtMs <= 0) {
            setCritical(false);
            return;
        }
        const tick = () => {
            setCritical(phaseEndsAtMs - Date.now() <= 5000);
        };
        tick();
        const id = window.setInterval(tick, 200);
        return () => window.clearInterval(id);
    }, [phaseEndsAtMs]);

    return critical;
}
