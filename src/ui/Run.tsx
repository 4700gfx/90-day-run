import type { HabitId } from "../config/run.config";
import { milestoneTimeline, scorecards, type Scorecard } from "../engine/checkins";
import { clearedBy } from "../engine/collections";
import { diffDays } from "../engine/dates";
import { tokenSummary } from "../engine/evaluate";
import { K } from "../store/records";
import { put } from "../store/store";
import { Card, fmtDate, money, shortHabit } from "./common";
import { StreakMap } from "./StreakMap";
import type { RunCtx } from "./useRun";

const ORDER: HabitId[] = ["workout", "spend", "hysa", "meals", "commit", "apply", "read"];
const KIND_LABEL = { money: "Money", book: "Book", checkin: "Check-in", school: "School", holiday: "Holiday" } as const;

export function Run({ ctx, openDay }: { ctx: RunCtx; openDay: (d: string) => void }) {
  const { ev, cfg, stats, run, profile, settings, activeRunId } = ctx;
  const dayNow = Math.min(Math.max(ev.todayNum, 0), cfg.lengthDays);
  const tokens = tokenSummary(ev, cfg);
  const pct = (v: number | null) => (v == null ? "—" : `${Math.round(v * 100)}%`);
  const cards = scorecards(ev, { ...run, collectionsClearedBy: (d) => clearedBy(run.collections, d) }, cfg, profile);
  const timeline = milestoneTimeline(cfg, profile, settings.book3);
  const nextId = timeline.find((m) => m.date >= ev.today && !run.milestones[m.id])?.id;
  const toggle = (id: string) => put(K.milestones(activeRunId), { ...run.milestones, [id]: !run.milestones[id] });

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

      <div className="scorecards">
        {cards.map((c) => (
          <ScorecardView key={c.day} card={c} today={ev.today} />
        ))}
      </div>

      <div className="cols">
        <div className="col">
          <Card title="Streak map" right={<span className="small">{stats.lostDays} lost</span>}>
            <StreakMap ctx={ctx} onOpen={openDay} />
          </Card>
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
            <p className="small">
              Share of decided days each habit was hit. Grace misses count as misses here; HYSA counts paydays only. Extended Grace: {tokens.remaining} of {tokens.total} tokens left.
            </p>
          </Card>
        </div>
        <Card title="Milestones" right={<span className="small">{timeline.filter((m) => m.checkable && run.milestones[m.id]).length} of {timeline.filter((m) => m.checkable).length} done</span>}>
          <ol className="timeline">
            {timeline.map((m) => {
              const done = !!run.milestones[m.id];
              const past = m.date < ev.today;
              return (
                <li key={m.id} className={`tl-${m.kind}${done ? " done" : ""}${past && !done ? " past" : ""}${m.id === nextId ? " next" : ""}`}>
                  <span className="tl-date mono">{fmtDate(m.date, { month: "short", day: "numeric" })}</span>
                  <span className="tl-body">
                    <span className="tl-label">{m.label}</span>
                    <span className="tl-meta">
                      {KIND_LABEL[m.kind]}
                      {m.id === nextId && <b> · Next{diffDays(m.date, ev.today) > 0 ? ` in ${diffDays(m.date, ev.today)}d` : " · today"}</b>}
                    </span>
                  </span>
                  {m.checkable ? (
                    <button className={`tl-check ${done ? "on" : ""}`} aria-pressed={done} aria-label={`${done ? "Mark not done" : "Mark done"}: ${m.label}`} onClick={() => toggle(m.id)}>
                      {done ? "✓" : ""}
                    </button>
                  ) : (
                    <span className="tl-check static" aria-hidden="true" />
                  )}
                </li>
              );
            })}
          </ol>
          {profile.moneyMilestones.length === 0 && <p className="small">Import your profile in Settings to add your money milestones.</p>}
          <p className="small">OSSU project milestones appear once your week-by-week map is set in Learn.</p>
        </Card>
      </div>
    </div>
  );
}

function ScorecardView({ card, today }: { card: Scorecard; today: string }) {
  const days = diffDays(card.date, today);
  return (
    <section className={`card scorecard ${card.unlocked ? "open" : "locked"}`} aria-label={`Day ${card.day} check-in`}>
      <div className="card-head">
        <h2>
          Day {card.day} <span className="small">{fmtDate(card.date, { month: "short", day: "numeric" })}</span>
        </h2>
        {card.unlocked ? (
          <span className={`tag ${card.metCount === card.metrics.length ? "t-good" : "t-warn"}`}>
            {card.metCount}/{card.metrics.length} met
          </span>
        ) : (
          <span className="tag t-muted">Unlocks in {days}d</span>
        )}
      </div>
      <ul className="metrics">
        {card.metrics.map((m) => {
          const fmt = (v: number) => (m.money ? money(v) : String(v));
          const ratio = m.actual == null ? 0 : Math.min(1, m.actual / Math.max(1, m.target));
          return (
            <li key={m.id}>
              <span className="m-label">
                {m.met === true && <span className="good-text" aria-label="met">✓ </span>}
                {m.met === false && <span className="bad-text" aria-label="missed">✗ </span>}
                {m.label}
              </span>
              <span className="mono m-val">
                {m.actual == null ? "—" : fmt(m.actual)} <span className="small">/ {fmt(m.target)}</span>
              </span>
              <span className={`m-bar ${m.met === false ? "miss" : ""}`} aria-hidden="true">
                <span style={{ width: `${ratio * 100}%` }} />
              </span>
            </li>
          );
        })}
      </ul>
      {!card.unlocked && <p className="small">Showing progress so far. Final score locks in on {fmtDate(card.date)}.</p>}
    </section>
  );
}
