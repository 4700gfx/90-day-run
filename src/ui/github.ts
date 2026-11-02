// Optional GitHub commit detection from public push events. Cached for 10 minutes,
// backs off on rate limits, and never marks anything by itself: the UI only suggests.
import { useEffect, useState } from "react";
import { RUN } from "../config/run.config";
import { pushesByDate } from "../engine/learn";

const TTL = 10 * 60_000;
const key = (u: string) => `run90_gh_${u.toLowerCase()}`;

interface Cache {
  at: number;
  pushes: Record<string, number>;
  error?: string;
  retryAt?: number;
}

function readCache(u: string): Cache | null {
  try {
    return JSON.parse(localStorage.getItem(key(u)) || "null");
  } catch {
    return null;
  }
}
function writeCache(u: string, c: Cache) {
  try {
    localStorage.setItem(key(u), JSON.stringify(c));
  } catch {
    /* ignore */
  }
}

export function useGithubPushes(user?: string): { pushes: Record<string, number>; error?: string; loading: boolean } {
  const [state, setState] = useState<{ pushes: Record<string, number>; error?: string; loading: boolean }>(() => {
    const c = user ? readCache(user) : null;
    return { pushes: c?.pushes ?? {}, error: c?.error, loading: false };
  });
  useEffect(() => {
    if (!user) return;
    const c = readCache(user);
    if (c) setState({ pushes: c.pushes, error: c.error, loading: false });
    const now = Date.now();
    if (c && (now - c.at < TTL || (c.retryAt && now < c.retryAt))) return;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    fetch(`https://api.github.com/users/${encodeURIComponent(user)}/events/public?per_page=100`, { headers: { Accept: "application/vnd.github+json" } })
      .then(async (r) => {
        if (r.status === 403 || r.status === 429) {
          const reset = Number(r.headers.get("x-ratelimit-reset")) * 1000;
          throw Object.assign(new Error("GitHub rate limit reached; will retry later"), { retryAt: reset || now + 30 * 60_000 });
        }
        if (r.status === 404) throw new Error(`GitHub user "${user}" not found`);
        if (!r.ok) throw new Error(`GitHub error ${r.status}`);
        return r.json();
      })
      .then((events) => {
        const pushes = pushesByDate(Array.isArray(events) ? events : [], RUN.timezone);
        writeCache(user, { at: Date.now(), pushes });
        if (alive) setState({ pushes, loading: false });
      })
      .catch((e: Error & { retryAt?: number }) => {
        const prev = readCache(user);
        writeCache(user, { at: Date.now(), pushes: prev?.pushes ?? {}, error: e.message, retryAt: e.retryAt });
        if (alive) setState({ pushes: prev?.pushes ?? {}, error: e.message, loading: false });
      });
    return () => {
      alive = false;
    };
  }, [user]);
  return state;
}
