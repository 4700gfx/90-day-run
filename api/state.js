const { Redis } = require("@upstash/redis");

const redis = Redis.fromEnv();

module.exports = async function handler(req, res) {
  const key = (req.query.key || "").toString();
  if (!/^[A-Za-z0-9_-]{4,64}$/.test(key)) {
    res.status(400).json({ error: "invalid key" });
    return;
  }
  const redisKey = `run90:${key}`;

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
};
