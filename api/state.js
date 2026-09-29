const { Redis } = require("@upstash/redis");

function getRedis() {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!url || !token) {
    const all = Object.keys(process.env)
      .filter((k) => !/^(npm_|VERCEL_|CI$|PATH$|HOME$|LANG$|PWD$|SHLVL$|_$|NODE_)/i.test(k))
      .sort();
    throw new Error(
      `Redis env vars not found (checked UPSTASH_REDIS_REST_URL/TOKEN and KV_REST_API_URL/TOKEN). All other env keys present: ${all.join(", ") || "(none)"}`
    );
  }
  return new Redis({ url, token });
}

function getKey(req) {
  if (req.query && req.query.key) return req.query.key.toString();
  if (req.body && req.body.key) return req.body.key.toString();
  return "";
}

module.exports = async function handler(req, res) {
  let redis;
  try {
    redis = getRedis();
  } catch (err) {
    res.status(500).json({ error: "redis not configured", detail: err.message });
    return;
  }

  const key = getKey(req);
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(key)) {
    res.status(400).json({ error: "invalid key" });
    return;
  }
  const redisKey = `run90:${key}`;

  try {
    if (req.method === "GET") {
      const data = await redis.get(redisKey);
      res.status(200).json({ exists: !!data, data: data || null });
      return;
    }

    if (req.method === "POST") {
      const { json, updated } = req.body || {};
      if (typeof json !== "string" || json.length > 200000) {
        res.status(400).json({ error: "bad body" });
        return;
      }
      await redis.set(redisKey, { json, updated: Number(updated) || Date.now() });
      res.status(200).json({ ok: true });
      return;
    }

    res.setHeader("Allow", "GET, POST");
    res.status(405).end();
  } catch (err) {
    res.status(500).json({ error: "redis operation failed", detail: err.message });
  }
};
