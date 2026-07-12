import React, { useEffect, useId, useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";
import { CircleHelp } from "lucide-react";

export type HandIconAction = {
    id: string;
    /** Accessible name — also used by visual tests / screen readers */
    label: string;
    description: string;
    icon: LucideIcon;
    onClick: () => void;
    disabled?: boolean;
    tone?: "green" | "yellow" | "red" | "neutral" | "blue";
};

const TONE_CLASS: Record<NonNullable<HandIconAction["tone"]>, string> = {
    green: "bg-ps-green text-black hover:bg-surface-strong",
    yellow: "bg-ps-yellow text-black hover:bg-surface-strong",
    red: "bg-ps-red text-white hover:bg-surface-strong hover:text-ps-red",
    blue: "bg-ps-blue text-white hover:bg-surface-strong",
    neutral: "bg-panel text-fg ring-1 ring-line hover:bg-surface-strong",
};

type Props = {
    actions: HandIconAction[];
    /** Optional chip before icons (e.g. DP count) */
    leading?: React.ReactNode;
};

/** Compact icon phase actions + help legend for the hand dock. */
export function HandIconActions({ actions, leading }: Props) {
    const [helpOpen, setHelpOpen] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);
    const helpId = useId();

    useEffect(() => {
        if (!helpOpen) return;
        const onPointerDown = (e: PointerEvent) => {
            if (!rootRef.current?.contains(e.target as Node)) setHelpOpen(false);
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === "Escape") setHelpOpen(false);
        };
        window.addEventListener("pointerdown", onPointerDown);
        window.addEventListener("keydown", onKey);
        return () => {
            window.removeEventListener("pointerdown", onPointerDown);
            window.removeEventListener("keydown", onKey);
        };
    }, [helpOpen]);

    if (actions.length === 0 && !leading) return null;

    return (
        <div ref={rootRef} className="relative ml-auto flex shrink-0 items-center gap-1.5 pl-1">
            {leading}
            {actions.map(action => {
                const Icon = action.icon;
                const tone = action.tone ?? "neutral";
                return (
                    <button
                        key={action.id}
                        type="button"
                        onClick={action.onClick}
                        disabled={action.disabled}
                        aria-label={action.label}
                        title={action.label}
                        className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-40 ${TONE_CLASS[tone]}`}
                    >
                        <Icon className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                    </button>
                );
            })}
            {actions.length > 0 && (
                <button
                    type="button"
                    onClick={() => setHelpOpen(o => !o)}
                    aria-expanded={helpOpen}
                    aria-controls={helpId}
                    aria-label={helpOpen ? "Hide action help" : "Show action help"}
                    title="Action help"
                    className={`inline-flex h-8 w-8 items-center justify-center rounded-full ring-1 transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] active:scale-[0.96] ${
                        helpOpen
                            ? "bg-ps-blue/15 text-ps-blue ring-ps-blue/40"
                            : "bg-panel text-muted ring-line hover:text-fg"
                    }`}
                >
                    <CircleHelp className="h-4 w-4" strokeWidth={2.25} aria-hidden />
                </button>
            )}

            {helpOpen && actions.length > 0 && (
                <div
                    id={helpId}
                    role="dialog"
                    aria-label="Hand action legend"
                    className="absolute bottom-full right-0 z-[40] mb-2 w-[min(18rem,calc(100vw-1.5rem))] rounded-xl bg-surface-strong/98 p-2.5 ring-1 ring-line shadow-lg backdrop-blur-md"
                >
                    <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.16em] text-muted">
                        Actions
                    </p>
                    <ul className="flex flex-col gap-1.5">
                        {actions.map(action => {
                            const Icon = action.icon;
                            const tone = action.tone ?? "neutral";
                            return (
                                <li
                                    key={action.id}
                                    className="flex items-start gap-2 rounded-lg bg-panel/80 px-2 py-1.5"
                                >
                                    <span
                                        className={`mt-0.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${TONE_CLASS[tone]}`}
                                    >
                                        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} aria-hidden />
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block text-[11px] font-black uppercase tracking-wide text-fg">
                                            {action.label}
                                        </span>
                                        <span className="block text-[10px] leading-snug text-muted">
                                            {action.description}
                                        </span>
                                    </span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}
        </div>
    );
}
