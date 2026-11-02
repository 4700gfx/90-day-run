import type { HabitId } from "../config/run.config";
import { tokenSummary } from "../engine/evaluate";
import { Card, shortHabit } from "./common";
import { StreakMap } from "./StreakMap";
import type { RunCtx } from "./useRun";

const ORDER: HabitId[] = ["workout", "spend", "hysa", "meals", "commit", "apply", "read"];

export function Run({ ctx, openDay }: { ctx: RunCtx; openDay: (d: string) => void }) {
  const { ev, cfg, stats } = ctx;
  const dayNow = Math.min(Math.max(ev.todayNum, 0), cfg.lengthDays);
  const tokens = tokenSummary(ev, cfg);
  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);

  return (
    <div className="screen">
      <header className="dayhead">
        <div>
          <div className="eyebrow">The run so far</div>
          <h1 className="daynum">
            Day {dayNow} <span className="of">/ {cfg.lengthDays}</span>
          </h1>
        </div>
      </header>
      <div className="kv kv4">
        <div>
          <b className="mono">{stats.wonDays}</b>
          <span>days won</span>
        </div>
        <div>
          <b className="mono">{stats.decidedDays ? pct(stats.winRate) : "—"}</b>
          <span>win rate</span>
        </div>
        <div>
          <b className="mono">{stats.currentStreak}</b>
          <span>current streak</span>
        </div>
        <div>
          <b className="mono">{stats.longestStreak}</b>
          <span>best streak</span>
        </div>
      </div>
      <div className="cols">
        <Card title="Streak map" right={<span className="small">{stats.lostDays} lost</span>}>
          <StreakMap ctx={ctx} onOpen={openDay} />
        </Card>
        <div className="col">
          <Card title="Habit completion">
            <ul className="bars">
              {ORDER.map((h) => {
                const v = stats.habitPct[h];
                return (
                  <li key={h}>
                    <span className="lbl">{shortHabit[h]}</span>
                    <span className="track" aria-hidden="true">
                      <span style={{ width: `${(v ?? 0) * 100}%` }} />
                    </span>
                    <span className="mono val">{pct(v)}</span>
                  </li>
                );
              })}
            </ul>
            <p className="small">Share of decided days each habit was hit. Grace misses count as misses here. HYSA counts paydays only.</p>
          </Card>
          <Card title="Extended Grace">
            <p className="small" style={{ marginTop: 0 }}>
              {tokens.remaining} of {tokens.total} tokens left (1 per 2-week block, Week 13 has its own).
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}
