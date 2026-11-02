// Per-record last-write-wins merge, shared by /api/sync and its tests.
// A record is { v: <any JSON>, u: <ms epoch updatedAt> }.

const KEY_RE = /^[A-Za-z0-9/_:.-]{1,200}$/;

function isRecord(r) {
  return !!r && typeof r === "object" && typeof r.u === "number" && Number.isFinite(r.u) && "v" in r;
}

/**
 * @param {Record<string, {v:any,u:number}>} existing  current server records
 * @param {Record<string, {v:any,u:number}>} changes   records sent by a device
 * @returns {{ merged: Record<string, any>, writes: Record<string, any>, rejected: string[] }}
 */
function mergeChanges(existing, changes) {
  const merged = { ...(existing || {}) };
  const writes = {};
  const rejected = [];
  for (const [k, rec] of Object.entries(changes || {})) {
    if (!KEY_RE.test(k) || !isRecord(rec)) {
      rejected.push(k);
      continue;
    }
    const cur = merged[k];
    if (!isRecord(cur) || cur.u < rec.u) {
      merged[k] = rec;
      writes[k] = rec;
    }
  }
  return { merged, writes, rejected };
}

module.exports = { mergeChanges, KEY_RE };
