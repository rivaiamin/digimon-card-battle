import React, { useEffect, useState } from "react";

type PhaseTimerProps = {
    phaseEndsAtMs?: number;
    phase: string;
};

export const PhaseTimer: React.FC<PhaseTimerProps> = ({ phaseEndsAtMs, phase }) => {
    const [remainingSec, setRemainingSec] = useState<number | null>(null);

    useEffect(() => {
        if (!phaseEndsAtMs || phaseEndsAtMs <= 0) {
            setRemainingSec(null);
            return;
        }
        const tick = () => {
            const ms = Math.max(0, phaseEndsAtMs - Date.now());
            setRemainingSec(Math.ceil(ms / 1000));
        };
        tick();
        const id = window.setInterval(tick, 250);
        return () => window.clearInterval(id);
    }, [phaseEndsAtMs, phase]);

    if (remainingSec === null) return null;

    const critical = remainingSec <= 5;

    return (
        <div
            className={`fixed top-16 left-1/2 -translate-x-1/2 z-[200] pointer-events-none font-mono text-sm font-black tracking-widest px-4 py-1.5 border-2 tabular-nums bg-surface ${
                critical
                    ? "border-ps-red text-ps-red animate-pulse shadow-[0_0_20px_rgba(255,60,60,0.5)]"
                    : "border-line text-fg"
            }`}
        >
            {remainingSec}s
        </div>
    );
};
