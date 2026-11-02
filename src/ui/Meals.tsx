import { HOLIDAYS, MEAL_CYCLES, MEAL_RESCUES_PER_WEEK, WEEKEND_RESTAURANTS } from "../config/run.config";
import { dateForDay, dayNumber, weekCount, weekOf, weekRange } from "../engine/dates";
import { mealCycleForWeek } from "../engine/plan";
import { Card, fmtDate } from "./common";
import type { RunCtx } from "./useRun";

export function Meals({ ctx }: { ctx: RunCtx }) {
  const { cfg, clock, run } = ctx;
  const total = weekCount(cfg);
  const week = Math.max(1, Math.min(total, weekOf(dayNumber(clock.today, cfg))));
  const cycle = mealCycleForWeek(week);
  const c = MEAL_CYCLES[cycle - 1]!;
  const rest = week % 2 === 1 ? WEEKEND_RESTAURANTS.odd : WEEKEND_RESTAURANTS.even;
  const { first, last } = weekRange(week, cfg);
  let rescues = 0;
  for (let n = first; n <= last; n++) if (run.days[dateForDay(n, cfg)]?.mealRescue) rescues++;
  const nextBatch = week < total ? dateForDay(week * 7, cfg) : null; // the Sunday that ends this week
  const upcomingHolidays = HOLIDAYS.filter((h) => h.date >= clock.today).slice(0, 2);

  return (
    <div className="screen">
      <header className="dayhead">
        <div>
          <div className="eyebrow">Meals · Week {week}</div>
          <h1 className="daynum">Cycle {cycle}</h1>
        </div>
      </header>
      <div className="cols">
        <div className="col">
          <Card title="This week (Mon–Fri prep)">
            <dl className="plan">
              <dt>Lunch</dt>
              <dd>{c.lunch}</dd>
              <dt>Dinner</dt>
              <dd>{c.dinner}</dd>
              <dt>Sat</dt>
              <dd>{rest.sat}</dd>
              <dt>Sun</dt>
              <dd>{rest.sun}</dd>
            </dl>
            <p className={`small ${rescues > MEAL_RESCUES_PER_WEEK ? "warn-text" : ""}`}>
              Weekday rescues used: {rescues}/{MEAL_RESCUES_PER_WEEK}. One on-list restaurant order a week can replace a prepped meal and still count.
            </p>
            {nextBatch && (
              <p className="small">
                Next batch cook: {fmtDate(nextBatch)} → cycle {mealCycleForWeek(week + 1)} ({MEAL_CYCLES[mealCycleForWeek(week + 1) - 1]!.lunch} / {MEAL_CYCLES[mealCycleForWeek(week + 1) - 1]!.dinner}).
              </p>
            )}
            {upcomingHolidays.length > 0 && <p className="small">Coming up: {upcomingHolidays.map((h) => `${h.label} (${fmtDate(h.date, { month: "short", day: "numeric" })})`).join(", ")}.</p>}
          </Card>
        </div>
        <Card title="Rotation">
          <table className="ttable">
            <thead>
              <tr>
                <th scope="col">Cycle</th>
                <th scope="col">Lunch</th>
                <th scope="col">Dinner</th>
              </tr>
            </thead>
            <tbody>
              {MEAL_CYCLES.map((m) => (
                <tr key={m.cycle} className={m.cycle === cycle ? "current" : ""}>
                  <td className="mono">
                    {m.cycle}
                    {m.cycle === cycle && <span className="sr-only"> (this week)</span>}
                    {m.cycle === cycle ? " ●" : ""}
                  </td>
                  <td>{m.lunch}</td>
                  <td>{m.dinner}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="small">
            Week n uses cycle ((n − 1) mod 7) + 1, cooked the Sunday before. Weekends: odd weeks {WEEKEND_RESTAURANTS.odd.sat} / {WEEKEND_RESTAURANTS.odd.sun}, even weeks {WEEKEND_RESTAURANTS.even.sat} / {WEEKEND_RESTAURANTS.even.sun}.
          </p>
        </Card>
      </div>
    </div>
  );
}
