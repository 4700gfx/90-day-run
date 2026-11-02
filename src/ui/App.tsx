import { useEffect, useState } from "react";
import { dateForDay, dayNumber, weekOf } from "../engine/dates";
import { useStore } from "../store/store";
import { Card } from "./common";
import { Settings } from "./Settings";
import { Body } from "./Body";
import { Jobs } from "./Jobs";
import { Learn } from "./Learn";
import { Money } from "./Money";
import { Run } from "./Run";
import { Today } from "./Today";
import { useRun } from "./useRun";
import { Week } from "./Week";

type Tab = "today" | "week" | "run" | "money" | "body" | "jobs" | "learn" | "review" | "settings";
const TABS: { id: Tab; label: string; icon: string; phase?: number }[] = [
  { id: "today", label: "Today", icon: "●" },
  { id: "week", label: "Week", icon: "▦" },
  { id: "run", label: "Run", icon: "◫" },
  { id: "money", label: "Money", icon: "$" },
  { id: "body", label: "Body", icon: "◭" },
  { id: "jobs", label: "Jobs", icon: "▤" },
  { id: "learn", label: "Learn", icon: "✎" },
  { id: "review", label: "Review", icon: "↺", phase: 6 },
  { id: "settings", label: "Settings", icon: "⚙" },
];
const PRIMARY: Tab[] = ["today", "week", "run", "money"];

const tabFromHash = (): Tab => {
  const h = location.hash.replace("#", "") as Tab;
  return TABS.some((t) => t.id === h) ? h : "today";
};

export function App() {
  const ctx = useRun();
  const store = useStore();
  const { cfg, clock, settings } = ctx;
  const [tab, setTabState] = useState<Tab>(tabFromHash);
  const [moreOpen, setMoreOpen] = useState(false);
  const lastDay = dateForDay(cfg.lengthDays, cfg);
  const clampDate = (d: string) => (d < cfg.prepDate ? cfg.prepDate : d > lastDay ? lastDay : d);
  const [date, setDate] = useState(() => clampDate(clock.today));
  const [week, setWeek] = useState(() => Math.min(Math.max(1, weekOf(dayNumber(clock.today, cfg))), Math.ceil(cfg.lengthDays / 7)));

  const setTab = (t: Tab) => {
    setTabState(t);
    setMoreOpen(false);
    history.replaceState(null, "", `#${t}`);
    window.scrollTo({ top: 0 });
  };

  useEffect(() => {
    const onHash = () => setTabState(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", settings.theme === "light" ? "#f4f2ec" : "#0b0f17");
  }, [settings.theme]);

  // Follow the calendar: when the date rolls over, jump to the new today.
  const [lastToday, setLastToday] = useState(clock.today);
  useEffect(() => {
    if (clock.today !== lastToday) {
      setLastToday(clock.today);
      setDate(clampDate(clock.today));
    }
  }, [clock.today]); // eslint-disable-line react-hooks/exhaustive-deps

  const current = TABS.find((t) => t.id === tab)!;
  const syncDot = store.status === "synced" ? "ok" : store.status === "error" ? "bad" : store.status === "local" ? "off" : "busy";

  return (
    <div className="app">
      <aside className="sidebar" aria-label="Sections">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            90
          </span>
          <span>
            <b>The 90-Day Run</b>
            <small>Restart · Nov 2 – Jan 30</small>
          </span>
        </div>
        <nav>
          {TABS.map((t) => (
            <button key={t.id} className={`navbtn ${tab === t.id ? "on" : ""}`} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
              <span aria-hidden="true">{t.icon}</span> {t.label}
              {t.phase && <small className="soon">soon</small>}
            </button>
          ))}
        </nav>
        <div className={`syncline dot-${syncDot}`}>
          <span className="dot" aria-hidden="true" /> {store.status === "local" ? "Not syncing" : store.status === "synced" ? "Synced" : store.status === "syncing" ? "Syncing…" : store.status === "offline" ? "Offline" : "Sync error"}
        </div>
      </aside>

      <header className="topbar">
        <span className="brand-mark sm" aria-hidden="true">
          90
        </span>
        <b>{current.label}</b>
        <button className={`syncline dot-${syncDot}`} onClick={() => setTab("settings")} aria-label={`Sync status: ${store.status}. Open settings`}>
          <span className="dot" aria-hidden="true" />
        </button>
      </header>

      <main className="main" id="main">
        {tab === "today" && <Today ctx={ctx} date={date} setDate={(d) => setDate(clampDate(d))} />}
        {tab === "week" && (
          <Week
            ctx={ctx}
            week={week}
            setWeek={setWeek}
            openDay={(d) => {
              setDate(clampDate(d));
              setTab("today");
            }}
          />
        )}
        {tab === "run" && (
          <Run
            ctx={ctx}
            openDay={(d) => {
              setDate(clampDate(d));
              setTab("today");
            }}
          />
        )}
        {tab === "money" && <Money ctx={ctx} />}
        {tab === "body" && <Body ctx={ctx} />}
        {tab === "jobs" && <Jobs ctx={ctx} />}
        {tab === "learn" && <Learn ctx={ctx} />}
        {tab === "settings" && <Settings ctx={ctx} />}
        {current.phase && (
          <div className="screen">
            <header className="dayhead">
              <h1 className="daynum">{current.label}</h1>
            </header>
            <Card>
              <p>
                Coming in Phase {current.phase} of the upgrade. Your data for it is already being kept.
              </p>
            </Card>
          </div>
        )}
      </main>

      <nav className="tabbar" aria-label="Sections">
        {PRIMARY.map((id) => {
          const t = TABS.find((x) => x.id === id)!;
          return (
            <button key={id} className={tab === id ? "on" : ""} aria-current={tab === id ? "page" : undefined} onClick={() => setTab(id)}>
              <span aria-hidden="true">{t.icon}</span>
              {t.label}
            </button>
          );
        })}
        <button className={!PRIMARY.includes(tab) ? "on" : ""} aria-expanded={moreOpen} onClick={() => setMoreOpen((o) => !o)}>
          <span aria-hidden="true">⋯</span>More
        </button>
      </nav>
      {moreOpen && (
        <div className="sheet" role="dialog" aria-label="More sections" onClick={() => setMoreOpen(false)}>
          <div className="sheet-body" onClick={(e) => e.stopPropagation()}>
            {TABS.filter((t) => !PRIMARY.includes(t.id)).map((t) => (
              <button key={t.id} className={`navbtn ${tab === t.id ? "on" : ""}`} onClick={() => setTab(t.id)}>
                <span aria-hidden="true">{t.icon}</span> {t.label}
                {t.phase && <small className="soon">soon</small>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
