"use strict";
const DEFAULT_LIMIT = 4800;
let cloudbase, app, database;
try { cloudbase = require("@cloudbase/node-sdk"); } catch {}
function db() { if (process.env.MUSIC_GATEWAY_MEMORY_STORE === "1" || !cloudbase) return; if (!app) { app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV }); database = app.database(); } return database; }
const memory = new Map();
let quotaQueue = Promise.resolve();
function dayKey() { return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
async function consumeQuotaOnce() {
  const key = dayKey(), limit = Math.max(1, Number(process.env.NETEASE_DAILY_CALL_LIMIT) || DEFAULT_LIMIT), store = db();
  let count = memory.get(key) || 0;
  if (store) {
    try { const row = (await store.collection("music_api_quota").doc(key).get()).data?.[0]; count = Math.max(count, Number(row?.count) || 0); } catch {}
  }
  if (count >= limit) { const error = new Error("网易云接口今日调用额度已达到安全上限"); error.code = "quota_exceeded"; error.status = 429; throw error; }
  count += 1; memory.set(key, count);
  if (store) { try { await store.collection("music_api_quota").doc(key).set({ count, limit, updatedAt: Date.now() }); } catch {} }
  return { count, limit };
}
function consumeQuota() {
  const current = quotaQueue.then(consumeQuotaOnce, consumeQuotaOnce);
  quotaQueue = current.then(() => undefined, () => undefined);
  return current;
}
module.exports = { consumeQuota, dayKey };
