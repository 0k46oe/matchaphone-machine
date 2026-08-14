"use strict";

const cloudbase = require("@cloudbase/node-sdk");
const { createHash } = require("node:crypto");
const { createActivationService } = require("./service");

let app;
let activate;

function getApp() {
  if (!app) app = cloudbase.init({ env: cloudbase.SYMBOL_CURRENT_ENV });
  return app;
}

function attemptId(uid) {
  return createHash("sha256").update(uid).digest("hex");
}

function createRepository(database) {
  const codes = database.collection("activation_codes");
  const attempts = database.collection("activation_attempts");
  return {
    async getCode(codeHash) {
      const result = await codes.doc(codeHash).get();
      return result.data?.[0] ?? null;
    },
    async claimCode(codeHash, data) {
      return database.runTransaction(async (transaction) => {
        const reference = transaction.collection("activation_codes").doc(codeHash);
        const snapshot = await reference.get();
        const current = Array.isArray(snapshot.data) ? snapshot.data[0] ?? null : snapshot.data ?? null;
        if (!current || current.status !== "unused") return false;
        await reference.update(data);
        return true;
      });
    },
    async getAttempt(uid) {
      const result = await attempts.doc(attemptId(uid)).get();
      return result.data?.[0] ?? null;
    },
    async setAttempt(uid, data) {
      const id = attemptId(uid);
      await attempts.doc(id).set(data);
    },
    async clearAttempt(uid) {
      try {
        await attempts.doc(attemptId(uid)).remove();
      } catch {}
    },
  };
}

function getActivate() {
  if (!activate) {
    const database = getApp().database();
    activate = createActivationService({
      repository: createRepository(database),
      privateKeyPem: process.env.ACTIVATION_LICENSE_PRIVATE_KEY_B64
        ? Buffer.from(process.env.ACTIVATION_LICENSE_PRIVATE_KEY_B64, "base64").toString("utf8")
        : process.env.ACTIVATION_LICENSE_PRIVATE_KEY,
      publicKeyId: process.env.ACTIVATION_PUBLIC_KEY_ID,
    });
  }
  return activate;
}

exports.main = async (event) => {
  if (event?.action !== "activate") return { ok: false, reason: "invalid-code" };
  let uid = "";
  try {
    uid = getApp().auth().getUserInfo()?.uid ?? "";
  } catch {}
  if (!uid) return { ok: false, reason: "unauthenticated" };
  try {
    return await getActivate()({
      uid,
      code: event.code,
      requestId: event.requestId,
      device: event.device,
    });
  } catch (error) {
    console.error("[activation-gateway] request failed", error?.name ?? "Error", error?.code ?? "", error?.message ?? "unknown");
    return { ok: false, reason: "invalid-device" };
  }
};