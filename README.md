# The 90-Day Run Tracker

Daily habit tracker for the 90-Day Run (Sep 27 – Dec 25, 2026): workout, daily spend, meal plan, code commits, job applications, reading, HYSA deposits, weigh-ins and milestones.

Static site — a single `index.html`, no build step.

## Deploy on Vercel
1. Push this repo to GitHub.
2. In Vercel: **Add New → Project → Import** this repo.
3. Framework preset: **Other**. Leave build command and output directory empty.
4. Deploy.

## Data
Progress is saved in the browser's localStorage first, so it always works offline. Click **Sync** in the header to also back it up server-side and share it across devices/browsers:

1. In the Vercel dashboard, open this project → **Storage** → add an **Upstash Redis** database (Marketplace, free tier). This auto-injects `KV_REST_API_URL` / `KV_REST_API_TOKEN`-style env vars the `@upstash/redis` client reads via `Redis.fromEnv()`.
2. Redeploy so the new env vars are picked up.
3. Click **Sync** on the site, enter (or generate) a short code, and enter that same code on any other device to pull the same run.

The sync code is a lightweight passcode, not real authentication — anyone with the exact code can read/write that run's data. Fine for personal use; don't reuse a guessable code for anything sensitive.
