import type { ReactNode } from "react";
import type { HabitId } from "../config/run.config";
import { HABITS } from "../config/run.config";
import { toUTC } from "../engine/dates";
import type { DayLog, DayStatus, GraceResult } from "../engine/types";

export const money = (n: number) => {
  const neg = n < 0;
  const a = Math.abs(n);
  const s = a.toLocaleString("en-US", { minimumFractionDigits: a % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return `${neg ? "−" : ""}$${s}`;
};

export const fmtDate = (d: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }) =>
  new Intl.DateTimeFormat("en-US", { timeZone: "UTC", ...opts }).format(new Date(toUTC(d)));

export const habitLabel = (h: HabitId) => HABITS.find((x) => x.id === h)?.label ?? h;
export const shortHabit: Record<HabitId, string> = {
  workout: "Workout",
  spend: "Spend",
  hysa: "HYSA",
  meals: "Meals",
  commit: "Commit",
  apply: "Applies",
  read: "Read",
};

export const emptyLog = (date: string): DayLog => ({ date, habits: {}, floorDay: false, appliesCount: 0, updatedAt: new Date().toISOString() });

export const newId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

const STATUS_TEXT: Record<DayStatus, [string, string]> = {
  WON: ["✓", "Won"],
  LOST: ["✗", "Lost"],
  PENDING: ["…", "In progress"],
  FUTURE: ["", "Upcoming"],
  PREP: ["◆", "Setup day"],
};
export function StatusChip({ status, floor }: { status: DayStatus; floor?: boolean }) {
  const [icon, text] = STATUS_TEXT[status];
  return (
    <span className={`status s-${status.toLowerCase()}${floor && status === "WON" ? " s-floor" : ""}`}>
      <span aria-hidden="true">{icon}</span> {text}
      {floor && status === "WON" ? " · floor" : ""}
    </span>
  );
}

export function graceBadge(r: GraceResult | undefined, remaining: number): { text: string; tone: string } {
  switch (r?.kind) {
    case "grace":
      return { text: "Grace used", tone: "warn" };
    case "extended":
      return { text: "Extended grace", tone: "warn" };
    case "illegal":
      return { text: r.reason === "consecutive" ? "2 in a row" : "Not covered", tone: "bad" };
    default:
      return { text: remaining > 0 ? "1 grace left" : "Grace used this week", tone: remaining > 0 ? "muted" : "warn" };
  }
}

export function Card({ title, right, children, className = "" }: { title?: ReactNode; right?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || right) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {right}
        </div>
      )}
      {children}
    </section>
  );
}
