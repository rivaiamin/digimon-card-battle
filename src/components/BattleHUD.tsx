import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { cardImageSrc } from "../lib/cardImageSrc";
import { DigimonCardData, GameState } from "../types";
import { Circle, Triangle, X } from "lucide-react";

interface HUDProps {
  player: {
    active: DigimonCardData | null;
    hp: number;
    maxHp: number;
  };
  opponent: {
    active: DigimonCardData | null;
    hp: number;
    maxHp: number;
  };
  onAttack: (type: "circle" | "triangle" | "cross") => void;
  disabled?: boolean;
  state: GameState;
}

function ResourceStack({
  deck,
  trash,
  dp,
  align,
}: {
  deck: number;
  trash: number;
  dp: number;
  align: "left" | "right";
}) {
  return (
    <div
      className={`flex flex-col gap-2 p-2 ${align === "right" ? "items-end" : "items-start"}`}
    >
      <div className="flex gap-2">
        <StatBox label="Deck" value={deck} />
        <StatBox label="Trash" value={trash} />
      </div>
      <StatBox label="DP" value={dp} accent />
    </div>
  );
}

function StatBox({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div
      className={`min-w-[4.5rem] rounded border px-2 py-1.5 bg-surface-strong ${
        accent ? "border-ps-blue/40" : "border-line"
      }`}
    >
      <div className="text-[10px] font-medium text-muted">{label}</div>
      <div
        className={`text-lg font-bold tabular-nums leading-none ${
          accent ? "text-ps-blue" : "text-fg"
        }`}
      >
        {value}
      </div>
    </div>
  );
}

function UnitPanel({
  unit,
  hp,
  side,
}: {
  unit: DigimonCardData | null;
  hp: number;
  side: "player" | "opponent";
}) {
  const isOpponent = side === "opponent";

  return (
    <div
      className={`bg-surface-strong shadow-lg p-3 flex gap-3 h-full min-h-[9rem] ${
        isOpponent
          ? "border-b-4 border-ps-red rounded-b-lg"
          : "border-t-4 border-ps-blue rounded-t-lg"
      }`}
    >
      <div
        className={`relative w-24 shrink-0 aspect-square rounded border-2 overflow-hidden bg-neutral-900 ${
          isOpponent ? "border-ps-red/30" : "border-ps-blue/30"
        }`}
      >
        {unit ? (
          <img
            src={cardImageSrc(unit)}
            alt={unit.name}
            className="h-full w-full object-cover"
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-2 text-center text-[10px] font-semibold text-muted">
            {isOpponent ? "No Digimon" : "Deploy a Digimon"}
          </div>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold uppercase leading-tight text-fg">
              {unit?.name ?? "—"}
            </h2>
            <p className="text-xs text-muted">
              {unit ? `${unit.level} · ${unit.type}` : "—"}
            </p>
          </div>
        </div>

        <div className="mt-auto space-y-1">
          <div className="flex justify-between text-xs text-muted">
            <span>HP</span>
            <span className="font-semibold tabular-nums text-fg">
              {unit ? (
                <>
                  {hp} / {unit.maxHp}
                </>
              ) : (
                "—"
              )}
            </span>
          </div>
          <div
            className={`h-2 rounded-sm bg-fg/10 overflow-hidden border ${
              isOpponent ? "border-ps-red/20" : "border-ps-blue/20"
            }`}
          >
            <motion.div
              initial={false}
              animate={{
                width: `${unit && unit.maxHp > 0 ? (hp / unit.maxHp) * 100 : 0}%`,
              }}
              className={`h-full ${isOpponent ? "bg-ps-red" : "bg-ps-blue"}`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export const BattleHUD: React.FC<HUDProps> = ({
  player,
  opponent,
  onAttack,
  disabled,
  state,
}) => {
  return (
    <div className="fixed inset-0 pointer-events-none flex flex-col justify-between pt-28 pb-4 px-3 z-50 overflow-hidden">
      {/* Opponent row */}
      <div className="grid grid-cols-[auto_1fr] gap-3 max-w-5xl mx-auto w-full">
        <ResourceStack
          deck={state.opponent.deck.length}
          trash={state.opponent.trash.length}
          dp={state.opponent.dp}
          align="left"
        />
        <div className="pointer-events-auto max-w-md justify-self-center w-full">
          <UnitPanel unit={opponent.active} hp={opponent.hp} side="opponent" />
        </div>
      </div>

      {/* Player row */}
      <div className="grid grid-cols-[1fr_auto] gap-3 max-w-5xl mx-auto w-full items-end">
        <div className="pointer-events-auto max-w-md justify-self-center w-full">
          <UnitPanel unit={player.active} hp={player.hp} side="player" />
        </div>
        <ResourceStack
          deck={state.player.deck.length}
          trash={state.player.trash.length}
          dp={state.player.dp}
          align="right"
        />
      </div>

      {/* Attack picker */}
      <AnimatePresence>
        {state.phase === "battle_attack" && !state.player.attackLocked && player.active && (
          <motion.div
            initial={{ opacity: 0, x: 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 24 }}
            className="fixed right-4 bottom-36 z-[60] pointer-events-auto flex flex-col gap-2"
          >
            {(
              [
                {
                  type: "circle" as const,
                  icon: Circle,
                  atk: player.active.attacks!.circle,
                  colorClass: "text-ps-red",
                  borderClass: "border-ps-red/35",
                  hoverBorder: "hover:border-ps-red",
                  hoverBg: "hover:bg-ps-red/10",
                  filled: true,
                },
                {
                  type: "triangle" as const,
                  icon: Triangle,
                  atk: player.active.attacks!.triangle,
                  colorClass: "text-ps-blue",
                  borderClass: "border-ps-blue/35",
                  hoverBorder: "hover:border-ps-blue",
                  hoverBg: "hover:bg-ps-blue/10",
                  filled: true,
                },
                {
                  type: "cross" as const,
                  icon: X,
                  atk: player.active.attacks!.cross,
                  colorClass: "text-ps-yellow",
                  borderClass: "border-ps-yellow/35",
                  hoverBorder: "hover:border-ps-yellow",
                  hoverBg: "hover:bg-ps-yellow/10",
                  filled: false,
                },
              ] as const
            ).map(btn => (
              <button
                key={btn.type}
                type="button"
                onClick={() => onAttack(btn.type)}
                disabled={disabled}
                className={`flex w-56 items-center justify-between gap-3 rounded border bg-surface-strong px-3 py-2.5 text-left shadow-md transition -skew-x-6 ${btn.borderClass} ${
                  disabled
                    ? "opacity-40 cursor-not-allowed"
                    : `${btn.hoverBorder} ${btn.hoverBg} hover:-translate-x-0.5 active:scale-[0.98]`
                }`}
              >
                <div className="flex min-w-0 skew-x-6 items-center gap-2">
                  <btn.icon
                    className={`h-6 w-6 shrink-0 ${btn.colorClass} ${
                      btn.filled ? "fill-current" : "font-bold"
                    }`}
                  />
                  <div className="min-w-0">
                    <div className={`text-[10px] font-bold uppercase tracking-wide ${btn.colorClass}`}>
                      {btn.type}
                    </div>
                    <div className="truncate text-sm font-semibold text-fg">{btn.atk.name}</div>
                  </div>
                </div>
                <span className={`skew-x-6 text-lg font-bold tabular-nums ${btn.colorClass}`}>
                  {btn.atk.damage}
                </span>
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
