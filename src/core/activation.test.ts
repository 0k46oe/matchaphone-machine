import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  canonicalActivationPayload,
  clearActivationStorage,
  ensureActivationDevice,
  formatActivationCode,
  normalizeActivationCode,
  verifyActivationDevicePossession,
  verifyActivationLicenseSignature,
  verifyStoredActivation,
  type ActivationLicensePayload,
  type StoredActivationLicense,
} from "./activation";

beforeAll(() => {
  if (!globalThis.crypto?.subtle) throw new Error("Web Crypto is required for activation tests");
});

beforeEach(async () => {
  await clearActivationStorage();
});

function b64url(value: ArrayBuffer) {
  let binary = "";
  for (const byte of new Uint8Array(value)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function writeStoredLicense(license: StoredActivationLicense) {
  const database = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("chacha-activation-v1", 1);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction("activation", "readwrite");
    transaction.objectStore("activation").put(license, "license");
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
  database.close();
}

describe("activation client primitives", () => {
  it("normalizes pasted codes without weakening the expected shape", () => {
    expect(normalizeActivationCode("matcha-abcd efgh-2345_6789")).toBe("MATCHAABCDEFGH23456789");
    expect(normalizeActivationCode("MATCHA-TOO-SHORT")).toBe("");
    expect(formatActivationCode("matchaabcdefgh23456789")).toBe("MATCHA-ABCD-EFGH-2345-6789");
  });

  it("uses a stable canonical payload", () => {
    const payload: ActivationLicensePayload = {
      version: 1,
      environmentId: "env",
      activationId: "license",
      cloudbaseUid: "uid",
      deviceKeyHash: "hash",
      issuedAt: 1,
      permanent: true,
    };
    expect(canonicalActivationPayload(payload)).toBe(
      '{"version":1,"environmentId":"env","activationId":"license","cloudbaseUid":"uid","deviceKeyHash":"hash","issuedAt":1,"permanent":true}',
    );
  });

  it("accepts a valid ES256 license and rejects modified facts", async () => {
    const pair = (await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const publicJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    const deviceHash = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("device")));
    const payload: ActivationLicensePayload = {
      version: 1,
      environmentId: "matchaphone-d5gjgy87ybfb50382",
      activationId: "license-1",
      cloudbaseUid: "uid-1",
      deviceKeyHash: deviceHash,
      issuedAt: 123,
      permanent: true,
    };
    const signature = b64url(
      await crypto.subtle.sign(
        { name: "ECDSA", hash: "SHA-256" },
        pair.privateKey,
        new TextEncoder().encode(canonicalActivationPayload(payload)),
      ),
    );
    const license: StoredActivationLicense = { payload, signature, publicKeyId: "test" };
    expect(await verifyActivationLicenseSignature(license, publicJwk)).toBe(true);
    expect(
      await verifyActivationLicenseSignature(
        { ...license, payload: { ...payload, cloudbaseUid: "changed" } },
        publicJwk,
      ),
    ).toBe(false);
  });

  it("persists a non-exportable P-256 private key and validates the license after a refresh", async () => {
    const device = await ensureActivationDevice();
    expect(device.method).toBe("p256");
    expect(device.privateKey?.extractable).toBe(false);
    expect(await verifyActivationDevicePossession(device)).toBe(true);

    const signingPair = (await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    const publicJwk = await crypto.subtle.exportKey("jwk", signingPair.publicKey);
    const payload: ActivationLicensePayload = {
      version: 1,
      environmentId: "matchaphone-d5gjgy87ybfb50382",
      activationId: "license-refresh",
      cloudbaseUid: "uid-refresh",
      deviceKeyHash: device.keyHash,
      issuedAt: Date.now(),
      permanent: true,
    };
    const license: StoredActivationLicense = {
      payload,
      signature: b64url(
        await crypto.subtle.sign(
          { name: "ECDSA", hash: "SHA-256" },
          signingPair.privateKey,
          new TextEncoder().encode(canonicalActivationPayload(payload)),
        ),
      ),
      publicKeyId: "refresh-test",
    };
    await writeStoredLicense(license);

    expect(await verifyStoredActivation({ publicJwk, publicKeyId: "refresh-test" })).toBe(true);
    const restoredDevice = await ensureActivationDevice();
    expect(restoredDevice.keyHash).toBe(device.keyHash);
    expect(restoredDevice.privateKey?.extractable).toBe(false);
    expect(await verifyActivationDevicePossession(restoredDevice)).toBe(true);
    expect(await verifyStoredActivation({ publicJwk, publicKeyId: "refresh-test" })).toBe(true);
  });
});