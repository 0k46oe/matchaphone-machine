"use strict";
const memory = new Map();
async function cached(key, ttlMs, loader) {
  const hit = memory.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;
  const value = await loader();
  memory.set(key, { value, expiresAt: Date.now() + ttlMs });
  if (memory.size > 500) for (const [oldKey, row] of memory) if (row.expiresAt <= Date.now()) memory.delete(oldKey);
  return value;
}
module.exports = { cached };
