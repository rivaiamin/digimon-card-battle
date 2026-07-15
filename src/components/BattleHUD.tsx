import React from "react";
import { motion, AnimatePresence } from "motion/react";
import { Circle, Triangle, X, Swords, Shield } from "lucide-react";
import { DigimonCardData, GameState } from "../types";
import {
  getBattleRole,
  getOpponentBattleRole,
  type BattleRole,
} from "../lib/battleRoles";

interface HUDProps {
  player: {
    active: DigimonCardData | null;
    hp: number;
    maxHp: number;
  };
  onAttack: (type: "circle" | "triangle" | "cross") => void;
  disabled?: boolean;
  state: GameState;
  yourSessionId: string;
}

function ScorePips({ score, color }: { score: number; color: "ps-blue" | "ps-red" }) {
  const fill = color === "ps-blue" ? "bg-ps-blue border-fg" : "bg-ps-red border-fg";
  const empty =
    color === "ps-blue" ? "bg-transparent border-ps-blue/40" : "bg-transparent border-ps-red/40";
  return (
    <div className="flex gap-1" aria-label={`Score ${score}`}>
      {[0, 1, 2].map(i => (
        <div
          key={i}
          className={`h-2 w-2 rotate-45 border-2 sm:h-2.5 sm:w-2.5 ${i < score ? fill : empty}`}
        />
      ))}
    </div>
  );
}

function RoleBadge({ role }: { role: BattleRole }) {
  const isAttacker = role === "attacker";
  const Icon = isAttacker ? Swords : Shield;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[9px] font-semibold sm:text-[10px] ${
        isAttacker
          ? "bg-ps-yellow/15 text-ps-yellow border border-ps-yellow/30"
          : "bg-ps-blue/10 text-ps-blue border border-ps-blue/25"
      }`}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {isAttacker ? "Attacker" : "Defender"}
    </span>
  );
}

function StatChip({
  label,
  value,
  accent,
  compact,
}: {
  label: string;
  value: number;
  accent?: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={`rounded-md bg-surface-strong/95 ring-1 ${
        compact ? "px-1.5 py-0.5" : "px-2 py-1"
      } ${accent ? "ring-ps-blue/35" : "ring-line"}`}
    >
      <div
        className={`font-medium uppercase tracking-[0.14em] text-muted leading-none ${
          compact ? "text-[8px]" : "text-[9px]"
        }`}
      >
        {label}
      </div>
      <div
        className={`font-bold tabular-nums leading-none ${
          compact ? "mt-0 text-xs" : "mt-0.5 text-sm"
        } ${accent ? "text-ps-blue" : "text-fg"}`}
      >
        {value}
      </div>
    </div>
  );
}

function ResourceRow({
  deck,
  trash,
  dp,
  compact,
}: {
  deck: number;
  trash: number;
  dp: number;
  compact?: boolean;
}) {
  return (
    <div className={`flex flex-wrap items-center ${compact ? "gap-1" : "gap-1.5"}`}>
      <StatChip label="Deck" value={deck} compact={compact} />
      <StatChip label="Trash" value={trash} compact={compact} />
      <StatChip label="DP" value={dp} accent compact={compact} />
    </div>
  );
}

/** Seat plaque: player = identity left / resources right; opponent = flipped */
function SeatPlaque({
  score,
  scoreColor,
  role,
  deck,
  trash,
  dp,
  mirror = false,
}: {
  score: number;
  scoreColor: "ps-blue" | "ps-red";
  role: BattleRole;
  deck: number;
  trash: number;
  dp: number;
  /** Opponent: resources left, wins + role right */
  mirror?: boolean;
}) {
  const identity = (
    <div className="flex items-center gap-1.5">
      <ScorePips score={score} color={scoreColor} />
      <RoleBadge role={role} />
    </div>
  );
  const resources = <ResourceRow deck={deck} trash={trash} dp={dp} compact />;

  return (
    <div className="flex w-full min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 rounded-xl bg-panel/90 px-1.5 py-1.5 ring-1 ring-line backdrop-blur-md battle-hand-island">
      {mirror ? (
        <>
          {resources}
          {identity}
        </>
      ) : (
        <>
          {identity}
          {resources}
        </>
      )}
    </div>
  );
}

type AttackBtn = {
  type: "circle" | "triangle" | "cross";
  icon: typeof Circle;
  name: string;
  damage: number;
  colorClass: string;
  borderClass: string;
  hoverBorder: string;
  hoverBg: string;
  filled: boolean;
};

function AttackRow({
  attacks,
  onAttack,
  disabled,
}: {
  attacks: AttackBtn[];
  onAttack: (type: "circle" | "triangle" | "cross") => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex w-full items-stretch gap-1 sm:gap-1.5">
      {attacks.map(btn => (
        <button
          key={btn.type}
          type="button"
          onClick={() => onAttack(btn.type)}
          disabled={disabled}
          className={`flex min-w-0 flex-1 flex-row items-center justify-between gap-1 rounded-lg bg-surface-strong/95 px-1.5 py-1 text-left ring-1 transition duration-500 ease-[cubic-bezier(0.32,0.72,0,1)] sm:gap-2 sm:rounded-xl sm:px-2.5 sm:py-1.5 ${btn.borderClass} ${
            disabled
              ? "opacity-40 cursor-not-allowed"
              : `${btn.hoverBorder} ${btn.hoverBg} active:scale-[0.98]`
          }`}
        >
          <div className="flex min-w-0 items-center gap-1 sm:gap-1.5">
            <btn.icon
              className={`h-3.5 w-3.5 shrink-0 sm:h-5 sm:w-5 ${btn.colorClass} ${
                btn.filled ? "fill-current" : "font-bold"
              }`}
            />
            <div className="min-w-0">
              <div
                className={`text-[8px] font-bold uppercase tracking-[0.1em] sm:text-[9px] ${btn.colorClass}`}
              >
                {btn.type}
              </div>
              <div className="truncate text-[9px] font-semibold text-fg sm:text-xs max-w-[4.5rem] sm:max-w-[7rem]">
                {btn.name}
              </div>
            </div>
          </div>
          <span className={`shrink-0 text-sm font-bold tabular-nums sm:text-base ${btn.colorClass}`}>
            {btn.damage}
          </span>
        </button>
      ))}
    </div>
  );
}

export const BattleHUD: React.FC<HUDProps> = ({
  player,
  onAttack,
  disabled,
  state,
  yourSessionId,
}) => {
  const showAttack =
    state.phase === "battle_attack" && !state.player.attackLocked && !!player.active;

  const yourRole = getBattleRole(yourSessionId, state.activePlayerSessionId ?? "");
  const oppRole = getOpponentBattleRole(yourRole);
  const showRoles = !!state.activePlayerSessionId && state.phase !== "waiting";

  const attacks: AttackBtn[] | null =
    showAttack && player.active?.attacks
      ? [
          {
            type: "circle",
            icon: Circle,
            name: player.active.attacks.circle.name,
            damage: player.active.attacks.circle.damage,
            colorClass: "text-ps-red",
            borderClass: "ring-ps-red/35",
            hoverBorder: "hover:ring-ps-red",
            hoverBg: "hover:bg-ps-red/10",
            filled: true,
          },
          {
            type: "triangle",
            icon: Triangle,
            name: player.active.attacks.triangle.name,
            damage: player.active.attacks.triangle.damage,
            colorClass: "text-ps-blue",
            borderClass: "ring-ps-blue/35",
            hoverBorder: "hover:ring-ps-blue",
            hoverBg: "hover:bg-ps-blue/10",
            filled: true,
          },
          {
            type: "cross",
            icon: X,
            name: player.active.attacks.cross.name,
            damage: player.active.attacks.cross.damage,
            colorClass: "text-ps-yellow",
            borderClass: "ring-ps-yellow/35",
            hoverBorder: "hover:ring-ps-yellow",
            hoverBg: "hover:bg-ps-yellow/10",
            filled: false,
          },
        ]
      : null;

  return (
    <div className="fixed inset-0 z-[1050] pointer-events-none overflow-hidden px-2 sm:px-3">
      {/* Opponent seat — top left; flipped vs player (resources left, identity right) */}
      <div className="absolute top-3 left-2 right-2 z-[1090] sm:top-4 sm:left-3 sm:right-auto sm:w-full sm:max-w-lg">
        {showRoles ? (
          <SeatPlaque
            score={state.opponent.score}
            scoreColor="ps-red"
            role={oppRole}
            deck={state.opponent.deck.length}
            trash={state.opponent.trash.length + (state.opponent.dpSlot?.length ?? 0)}
            dp={state.opponent.dp}
            mirror
          />
        ) : (
          <ResourceRow
            deck={state.opponent.deck.length}
            trash={state.opponent.trash.length + (state.opponent.dpSlot?.length ?? 0)}
            dp={state.opponent.dp}
          />
        )}
      </div>

      {/* Player seat — above hand; attacks nest inside during choose-attack */}
      <div
        className="absolute inset-x-2 z-[1200] flex justify-center sm:inset-x-3"
        style={{ bottom: "calc(var(--battle-hand-clearance) + 0.85rem)" }}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={showAttack ? "seat-attack" : "seat"}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.35, ease: [0.32, 0.72, 0, 1] }}
            className={`pointer-events-auto w-full max-w-lg rounded-xl bg-panel/94 p-1.5 ring-1 ring-line backdrop-blur-md battle-hand-island ${
              showAttack ? "battle-player-seat--attack" : ""
            }`}
          >
            {attacks && (
              <div className="mb-3.5 sm:mb-4">
                <AttackRow attacks={attacks} onAttack={onAttack} disabled={disabled} />
              </div>
            )}
            <div className="flex w-full flex-wrap items-center justify-between gap-x-2 gap-y-1 px-0.5">
              {showRoles && (
                <div className="flex items-center gap-1.5">
                  <ScorePips score={state.player.score} color="ps-blue" />
                  <RoleBadge role={yourRole} />
                </div>
              )}
              <div className={showRoles ? "ml-auto" : undefined}>
                <ResourceRow
                  deck={state.player.deck.length}
                  trash={state.player.trash.length + (state.player.dpSlot?.length ?? 0)}
                  dp={state.player.dp}
                  compact
                />
              </div>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
};
