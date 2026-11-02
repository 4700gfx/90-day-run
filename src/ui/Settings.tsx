import { useRef, useState } from "react";
import type { PersonalProfile } from "../config/profile";
import { RUN } from "../config/run.config";
import { K, type Records, type Settings as SettingsT } from "../store/records";
import { put, replaceAll, setSyncCode, syncNow, useStore } from "../store/store";
import { Card, fmtDate, money } from "./common";
import type { RunCtx } from "./useRun";

const genCode = () => {
  const abc = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => abc[b % abc.length]).join("");
};

const download = (name: string, text: string) => {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
};

const readFile = (f: File) => f.text();

export function Settings({ ctx }: { ctx: RunCtx }) {
  const store = useStore();
  const { settings, profile, profileImported, runs, cfg } = ctx;
  const [codeInput, setCodeInput] = useState(store.syncCode);
  const [payday, setPayday] = useState("");
  const [msg, setMsg] = useState("");
  const profileFile = useRef<HTMLInputElement>(null);
  const backupFile = useRef<HTMLInputElement>(null);
  const saveSettings = (patch: Partial<SettingsT>) => put(K.settings, { ...settings, ...patch });
  const run1 = runs["run-1"];

  const importProfile = async (f: File) => {
    try {
      const p = JSON.parse(await readFile(f)) as Partial<PersonalProfile>;
      if (!p || typeof p !== "object" || !p.hysa) throw new Error("That file doesn't look like a profile (no \"hysa\" section).");
      put(K.profile, p);
      setMsg("Profile imported. It's saved with your data and syncs to your other devices.");
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
  };

  const importBackup = async (f: File) => {
    try {
      const j = JSON.parse(await readFile(f)) as { records?: Records };
      if (!j.records || typeof j.records !== "object") throw new Error("No records in that file.");
      if (!confirm(`Import ${Object.keys(j.records).length} records? Matching records on all synced devices will be replaced.`)) return;
      replaceAll(j.records);
      setMsg("Backup imported.");
    } catch (e) {
      setMsg(`Import failed: ${(e as Error).message}`);
    }
  };

  const statusText: Record<string, string> = {
    local: "This device only",
    syncing: "Syncing…",
    synced: store.lastSync ? `Synced ${new Date(store.lastSync).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "Synced",
    offline: "Offline: saved here, will sync when back online",
    error: `Sync error: ${store.error ?? "unknown"}`,
  };

  const paydays = settings.overrides.paydays ?? profile.hysa.paydays;
  const setPaydays = (ds: string[]) => saveSettings({ overrides: { ...settings.overrides, paydays: [...ds].sort() } });

  return (
    <div className="screen">
      <header className="dayhead">
        <h1 className="daynum">Settings</h1>
      </header>
      {msg && (
        <div className="banner" role="status">
          {msg}
        </div>
      )}
      <div className="cols">
        <div className="col">
          <Card title="Sync" right={<span className={`tag ${store.status === "synced" ? "t-good" : store.status === "error" ? "t-bad" : "t-muted"}`}>{statusText[store.status]}</span>}>
            <p className="small">
              Use the same sync code on your phone and desktop. Everything saves on this device first and syncs in the background. The code is a passcode, not a login: keep it long and private.
            </p>
            <label className="field">
              <span>Sync code</span>
              <input type="text" autoCapitalize="characters" autoComplete="off" spellCheck={false} value={codeInput} onChange={(e) => setCodeInput(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))} />
            </label>
            {store.syncCode && store.syncCode.length < 12 && <p className="small warn-text">Your code is short. Generate a longer one, then enter it on your other device.</p>}
            <div className="row-btns">
              <button className="btn primary" disabled={codeInput.length < 4 || codeInput === store.syncCode} onClick={() => setSyncCode(codeInput)}>
                Use this code
              </button>
              <button className="btn" onClick={() => setCodeInput(genCode())}>
                Generate
              </button>
              <button className="btn" disabled={!store.syncCode} onClick={() => void syncNow()}>
                Sync now
              </button>
            </div>
            {store.dirty.length > 0 && store.syncCode && <p className="small">{store.dirty.length} change(s) waiting to sync.</p>}
          </Card>

          <Card title="Profile" right={<span className={`tag ${profileImported ? "t-good" : "t-warn"}`}>{profileImported ? "Imported" : "Placeholders"}</span>}>
            <p className="small">
              Your money, debt and body numbers. They're kept out of the public code: import your <code>profile.local.json</code> once and it syncs with your data.
            </p>
            <input ref={profileFile} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void importProfile(e.target.files[0])} />
            <div className="row-btns">
              <button className="btn primary" onClick={() => profileFile.current?.click()}>
                Import profile
              </button>
              <button className="btn" onClick={() => download("profile.json", JSON.stringify(profile, null, 2))}>
                Export profile
              </button>
            </div>
            <p className="small">
              {profile.hysa.bank} · {money(profile.hysa.paydayDeposit)} per payday · target {money(profile.hysa.targetDay90)} · {profile.spendCategories.length} spend categories · {profile.collections.length} collection accounts
            </p>
          </Card>

          <Card title="Paydays">
            <p className="small">The HYSA habit is only scored on these dates: deposit {money(cfg.paydayDeposit)}+ that day or the next.</p>
            <div className="spend-form">
              <input type="date" aria-label="Payday date" value={payday} min={RUN.prepDate} onChange={(e) => setPayday(e.target.value)} />
              <button
                className="btn primary"
                disabled={!payday || paydays.includes(payday)}
                onClick={() => {
                  setPaydays([...paydays, payday]);
                  setPayday("");
                }}
              >
                Add
              </button>
            </div>
            <div className="chips">
              {paydays.length === 0 && <span className="small">No paydays yet.</span>}
              {paydays.map((d) => (
                <button key={d} className="chip" aria-label={`Remove payday ${fmtDate(d)}`} onClick={() => setPaydays(paydays.filter((x) => x !== d))}>
                  {fmtDate(d)} ✕
                </button>
              ))}
            </div>
          </Card>
        </div>

        <div className="col">
          <Card title="Display">
            <div className="seg" role="radiogroup" aria-label="Theme">
              {(["dark", "light"] as const).map((t) => (
                <button key={t} role="radio" aria-checked={settings.theme === t} className={settings.theme === t ? "on" : ""} onClick={() => saveSettings({ theme: t })}>
                  {t === "dark" ? "Dark" : "Light"}
                </button>
              ))}
            </div>
          </Card>

          <Card title="Overrides">
            <div className="grid2">
              <label className="field">
                <span>Daily allowance ($)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={settings.overrides.dailyAllowance ?? ""}
                  placeholder="20"
                  onChange={(e) => saveSettings({ overrides: { ...settings.overrides, dailyAllowance: e.target.value === "" ? undefined : Number(e.target.value) } })}
                />
              </label>
              <label className="field">
                <span>Payday deposit ($)</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min="0"
                  value={settings.overrides.paydayDeposit ?? ""}
                  placeholder={String(profile.hysa.paydayDeposit)}
                  onChange={(e) => saveSettings({ overrides: { ...settings.overrides, paydayDeposit: e.target.value === "" ? undefined : Number(e.target.value) } })}
                />
              </label>
            </div>
            <label className="field">
              <span>Book 3 (Days 83–90)</span>
              <input type="text" value={settings.book3 ?? ""} placeholder="The Psychology of Money" onChange={(e) => saveSettings({ book3: e.target.value || undefined })} />
            </label>
          </Card>

          <Card title="Body & Learn">
            <span className="small">Lift names</span>
            <div className="grid3">
              {[0, 1, 2].map((i) => (
                <input
                  key={i}
                  type="text"
                  aria-label={`Lift ${i + 1} name`}
                  value={(settings.liftNames ?? ctx.lifts)[i] ?? ""}
                  placeholder={`Lift ${i + 1}`}
                  onChange={(e) => {
                    const names = [0, 1, 2].map((j) => (settings.liftNames ?? ctx.lifts)[j] ?? `Lift ${j + 1}`);
                    names[i] = e.target.value;
                    saveSettings({ liftNames: names });
                  }}
                />
              ))}
            </div>
            <label className="field">
              <span>GitHub username (optional, public repos only)</span>
              <input type="text" autoCapitalize="none" autoComplete="off" spellCheck={false} value={settings.githubUser ?? ""} placeholder="e.g. 4700gfx" onChange={(e) => saveSettings({ githubUser: e.target.value.trim() || undefined })} />
            </label>
            <p className="small">Used only to suggest your daily commit. It never marks it for you.</p>
          </Card>

          <Card title="Backup">
            <p className="small">A manual backup of everything, including the Run 1 archive.</p>
            <input ref={backupFile} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && void importBackup(e.target.files[0])} />
            <div className="row-btns">
              <button className="btn primary" onClick={() => download(`90-day-run-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ exportedAt: new Date().toISOString(), records: store.records }, null, 2))}>
                Export JSON
              </button>
              <button className="btn" onClick={() => backupFile.current?.click()}>
                Import JSON
              </button>
            </div>
          </Card>

          <Card title="Run 1 archive">
            {run1 ? (
              <p className="small">
                {run1.name}: {Object.keys(run1.days).length} days logged, {run1.hysa.length} deposits, {run1.body.length} weigh-ins. Kept read-only. The viewer comes in a later phase.
              </p>
            ) : (
              <p className="small">No Run 1 data on this device yet.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
