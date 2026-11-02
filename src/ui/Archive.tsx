import type { RunView } from "../store/records";
import { fmtDate, money } from "./common";

const tick = (v: boolean | null | undefined) => (v === true ? "✓" : v === false ? "✗" : "·");

/** Read-only view of an archived run: every logged day plus deposits and weigh-ins. */
export function ArchiveView({ run }: { run: RunView }) {
  const days = Object.values(run.days).sort((a, b) => (a.date < b.date ? -1 : 1));
  const spendBy: Record<string, number> = {};
  for (const e of run.spend) if (!e.deleted) spendBy[e.date] = (spendBy[e.date] ?? 0) + e.amount;
  const deposits = run.hysa.filter((d) => !d.deleted);
  const body = (run.body as { weekStart: string; weight?: number; waist?: number; deleted?: boolean }[]).filter((b) => !b.deleted);
  const download = () => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ run: run.name, days, spend: run.spend, hysa: deposits, body }, null, 2)], { type: "application/json" }));
    a.download = `${run.id}.json`;
    a.click();
  };
  return (
    <div className="archive">
      <p className="small">
        {days.length} days · {deposits.length} deposits ({money(deposits.reduce((s, d) => s + d.amount, 0))}) · {body.length} weigh-ins. Scored under that run's own rules, so no win/loss is recomputed here.
      </p>
      <div className="scroll archive-scroll">
        <table className="ttable">
          <caption className="sr-only">Days logged in {run.name}</caption>
          <thead>
            <tr>
              <th scope="col">Date</th>
              <th scope="col" title="Workout">W</th>
              <th scope="col" title="Meals">M</th>
              <th scope="col" title="Commit">C</th>
              <th scope="col" title="Read">R</th>
              <th scope="col">Apps</th>
              <th scope="col">Spend</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {days.map((d) => (
              <tr key={d.date}>
                <td className="mono">{fmtDate(d.date, { month: "short", day: "numeric" })}</td>
                <td>{tick(d.habits.workout)}</td>
                <td>{tick(d.habits.meals)}</td>
                <td>{tick(d.habits.commit)}</td>
                <td>{tick(d.habits.read)}</td>
                <td className="mono">{d.appliesCount || ""}</td>
                <td className="mono">{spendBy[d.date] ? money(spendBy[d.date]!) : ""}</td>
                <td>{d.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button className="btn small-btn" onClick={download}>
        Download as JSON
      </button>
    </div>
  );
}
