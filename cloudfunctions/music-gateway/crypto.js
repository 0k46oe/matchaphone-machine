"use strict";
const crypto = require("node:crypto");
function keyOf(secret) {
  if (!secret || String(secret).length < 24) throw Object.assign(new Error("MUSIC_SESSION_ENCRYPTION_KEY must be at least 24 characters"), { code: "config_missing" });
  return crypto.createHash("sha256").update(String(secret)).digest();
}
function encryptJson(value, secret) {
  const iv = crypto.randomBytes(12), cipher = crypto.createCipheriv("aes-256-gcm", keyOf(secret), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
function decryptJson(value, secret) {
  const [version, iv, tag, data] = String(value || "").split(".");
  if (version !== "v1" || !data) return;
  const decipher = crypto.createDecipheriv("aes-256-gcm", keyOf(secret), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]).toString("utf8"));
}
function randomId(bytes = 24) { return crypto.randomBytes(bytes).toString("base64url"); }
module.exports = { encryptJson, decryptJson, randomId };
