function cloneFallback<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value as object)) return seen.get(value as object) as T;
  if (value instanceof Date) return new Date(value.getTime()) as T;
  if (value instanceof ArrayBuffer) return value.slice(0) as T;
  if (ArrayBuffer.isView(value)) {
    const view = value as unknown as ArrayBufferView;
    const copied = new Uint8Array(view.byteLength);
    copied.set(new Uint8Array(view.buffer, view.byteOffset, view.byteLength));
    const buffer = copied.buffer as ArrayBuffer;
    if (value instanceof DataView) return new DataView(buffer) as T;
    const Constructor = value.constructor as new (buffer: ArrayBuffer) => T;
    return new Constructor(buffer);
  }
  if (value instanceof Blob) return value.slice(0, value.size, value.type) as T;
  if (value instanceof Map) {
    const output = new Map();
    seen.set(value, output);
    value.forEach((entryValue, key) => output.set(cloneFallback(key, seen), cloneFallback(entryValue, seen)));
    return output as T;
  }
  if (value instanceof Set) {
    const output = new Set();
    seen.set(value, output);
    value.forEach((entryValue) => output.add(cloneFallback(entryValue, seen)));
    return output as T;
  }
  if (Array.isArray(value)) {
    const output: unknown[] = [];
    seen.set(value, output);
    value.forEach((entry, index) => { output[index] = cloneFallback(entry, seen); });
    return output as T;
  }
  const output: Record<PropertyKey, unknown> = {};
  seen.set(value as object, output);
  for (const key of Reflect.ownKeys(value as object)) output[key] = cloneFallback((value as Record<PropertyKey, unknown>)[key], seen);
  return output as T;
}

function arrayAt<T>(this: ArrayLike<T>, index: number) {
  const length = Math.trunc(Number(this.length)) || 0;
  const normalized = Math.trunc(Number(index)) || 0;
  const target = normalized < 0 ? length + normalized : normalized;
  return target < 0 || target >= length ? undefined : this[target];
}

function randomUuidFallback() {
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

export function installBrowserCompatibility() {
  if (typeof Array.prototype.at !== "function") {
    Object.defineProperty(Array.prototype, "at", { configurable: true, writable: true, value: arrayAt });
  }
  if (typeof globalThis.structuredClone !== "function") {
    Object.defineProperty(globalThis, "structuredClone", { configurable: true, writable: true, value: cloneFallback });
  }
  if (typeof globalThis.crypto !== "undefined" && typeof globalThis.crypto.getRandomValues === "function" && typeof globalThis.crypto.randomUUID !== "function") {
    try { Object.defineProperty(globalThis.crypto, "randomUUID", { configurable: true, value: randomUuidFallback }); } catch { /* Some browsers expose a non-extensible Crypto object. */ }
  }
}

export function browserCapabilitySnapshot() {
  return {
    arrayAt: typeof Array.prototype.at === "function",
    structuredClone: typeof globalThis.structuredClone === "function",
    randomUUID: typeof globalThis.crypto?.randomUUID === "function",
    readableStream: typeof globalThis.ReadableStream === "function",
    webLocks: typeof navigator !== "undefined" && Boolean((navigator as Navigator & { locks?: unknown }).locks),
  };
}
