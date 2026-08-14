"use strict";
const { encryptJson, decryptJson, randomId } = require("./crypto");
const COLLECTION = "music_sessions";
const SESSION_ID_PATTERN = /^[A-Za-z0-9_-]{32,128}$/;
let cloudbase;
try { cloudbase = require("@cloudbase/node-sdk"); } catch {}
let app, database;
function db() {
  if (process.env.MUSIC_GATEWAY_MEMORY_STORE === "1" || !cloudbase) return;
  if (!app) { app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV }); database = app.database(); }
  return database;
}
const fallback = new Map();
function cookieHeader(sessionId, maxAge = 60 * 60 * 24 * 30) {
  return `mira_music_session=${sessionId}; Path=/api/music; HttpOnly; Secure; SameSite=None; Partitioned; Max-Age=${maxAge}`;
}
function parseCookies(header = "") {
  return Object.fromEntries(String(header).split(";").map((part) => part.trim().split("=")).filter((pair) => pair.length === 2).map(([key, value]) => [key, decodeURIComponent(value)]));
}
function validSessionId(value) {
  const id = String(value || "").trim();
  return SESSION_ID_PATTERN.test(id) ? id : undefined;
}
async function loadSession(cookie, secret, fallbackSessionId) {
  const cookieValue = parseCookies(cookie).mira_music_session;
  const id = cookieValue ? validSessionId(cookieValue) : validSessionId(fallbackSessionId);
  if (!id) return {};
  let row;
  const store = db();
  if (store) { try { row = (await store.collection(COLLECTION).doc(id).get()).data?.[0]; } catch {} }
  else row = fallback.get(id);
  if (!row || row.expiresAt <= Date.now()) return { id };
  try { return { id, data: decryptJson(row.payload, secret) }; } catch { return { id }; }
}
async function saveSession(id, data, secret) {
  const sessionId = validSessionId(id) || randomId(), row = { payload: encryptJson(data, secret), updatedAt: Date.now(), expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 };
  const store = db();
  if (store) await store.collection(COLLECTION).doc(sessionId).set(row);
  else fallback.set(sessionId, row);
  return sessionId;
}
async function clearSession(id) {
  const sessionId = validSessionId(id);
  if (!sessionId) return;
  const store = db();
  if (store) { try { await store.collection(COLLECTION).doc(sessionId).remove(); } catch {} }
  else fallback.delete(sessionId);
}
module.exports = { loadSession, saveSession, clearSession, cookieHeader, validSessionId };
