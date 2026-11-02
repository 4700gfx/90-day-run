// POST /api/sync  { key, changes: { [recordKey]: { v, u } } }
//   → { records: { ...all records }, legacy: <old /api/state blob or null>, serverTime }
// Records live in one Redis hash per sync code: run90v3:<key>. Each record is
// merged last-write-wins on its own `u` timestamp, so edits from the phone and
// the desktop never overwrite each other wholesale.
// The sync code is a passcode, not real auth: use a long random one.
const { Redis } = require("@upstash/redis");
const { mergeChanges } = require("./_lib/merge");

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) throw new Error("Redis env vars not found (UPSTASH_REDIS_REST_URL/TOKEN or KV_REST_API_URL/TOKEN)");
  return new Redis({ url, token });
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).end();
    return;
  }
  const body = req.body || {};
  const key = typeof body.key === "string" ? body.key : "";
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(key)) {
    res.status(400).json({ error: "invalid key" });
    return;
  }
  if (body.changes != null && (typeof body.changes !== "object" || Array.isArray(body.changes))) {
    res.status(400).json({ error: "bad changes" });
    return;
  }
  if (JSON.stringify(body.changes || {}).length > 3_000_000) {
    res.status(413).json({ error: "too large" });
    return;
  }

  let redis;
  try {
    redis = getRedis();
  } catch (err) {
    res.status(500).json({ error: "redis not configured", detail: err.message });
    return;
  }

  try {
    const hk = `run90v3:${key}`;
    const existing = (await redis.hgetall(hk)) || {};
    const wasEmpty = Object.keys(existing).length === 0;
    const { merged, writes, rejected } = mergeChanges(existing, body.changes);
    if (Object.keys(writes).length) await redis.hset(hk, writes);
    // First v3 sync for this code: hand back the old single-blob data so the client can migrate it.
    const legacy = wasEmpty ? await redis.get(`run90:${key}`) : null;
    res.status(200).json({ records: merged, legacy: legacy || null, rejected, serverTime: Date.now() });
  } catch (err) {
    res.status(500).json({ error: "redis operation failed", detail: err.message });
  }
};
