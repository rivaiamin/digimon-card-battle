import React, { useEffect, useRef, useState } from "react";
import { Settings } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { AudioSettings } from "./AudioSettings";
import { useAudio } from "../context/AudioProvider";

export function SystemMenu({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const { playSfx } = useAudio();

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          setOpen(o => !o);
          playSfx("menu_click");
        }}
        className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full bg-surface-strong/95 text-muted ring-1 ring-line transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] hover:text-ps-blue hover:ring-ps-blue/40 active:scale-[0.96]"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={open ? "Close system menu" : "Open system menu"}
      >
        <Settings
          className={`h-5 w-5 transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] ${
            open ? "rotate-90 text-ps-blue" : ""
          }`}
          strokeWidth={1.5}
        />
      </button>

      {open && (
        <div
          className="absolute top-full right-0 mt-2 flex min-w-[12rem] flex-col gap-2 rounded-2xl bg-surface-strong/95 p-3 ring-1 ring-line backdrop-blur-md pointer-events-auto z-[300]"
          role="dialog"
          aria-label="System options"
        >
          <ThemeToggle className="w-full justify-center rounded-lg" />
          <AudioSettings className="w-full [&_button]:w-full [&_button]:justify-center [&_button]:rounded-lg" />
        </div>
      )}
    </div>
  );
}
