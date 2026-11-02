// Daily schedule shifted by the user's wake and get-home times.
import { DEFAULT_HOME, DEFAULT_WAKE, SCHEDULE } from "../config/run.config";

const toMin = (hm: string) => {
  const [h, m] = hm.split(":").map(Number) as [number, number];
  return h * 60 + m;
};
const fmt = (min: number) => {
  const m = ((min % 1440) + 1440) % 1440;
  const h = Math.floor(m / 60);
  return `${((h + 11) % 12) + 1}:${String(m % 60).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};

export interface ScheduledBlock {
  time: string;
  block: string;
  startMin: number;
}

export function scheduleFor(wake = DEFAULT_WAKE, home = DEFAULT_HOME): ScheduledBlock[] {
  const dw = toMin(wake) - toMin(DEFAULT_WAKE);
  const dh = toMin(home) - toMin(DEFAULT_HOME);
  return SCHEDULE.map((s) => {
    const shift = s.anchor === "wake" ? dw : s.anchor === "home" ? dh : 0;
    const start = toMin(s.start) + shift;
    const end = s.end ? toMin(s.end) + shift : undefined;
    return { startMin: start, block: s.block, time: end != null ? `${fmt(start)}–${fmt(end)}` : fmt(start) };
  }).sort((a, b) => a.startMin - b.startMin);
}

/** "HH:MM" of the Log-the-day block, used for the evening reminder. */
export function logTime(home = DEFAULT_HOME): string {
  const s = SCHEDULE.find((b) => b.block === "Log the day")!;
  const m = toMin(s.start) + toMin(home) - toMin(DEFAULT_HOME);
  return `${String(Math.floor(m / 60) % 24).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}
