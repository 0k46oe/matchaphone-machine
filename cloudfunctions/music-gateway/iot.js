"use strict";

const crypto = require("node:crypto");
const { consumeQuota } = require("./quota");

const IOT_BASE_URL = "https://openapi.music.163.com";
const IOT_SIGN_TYPE = "RSA_SHA256";
const IOT_TIMEOUT_MS = 20000;
const PAGE_LIMIT = 500;
const MAX_PAGES = 40;

const CONFIG_FIELDS = {
  appId: "NETEASE_APP_ID",
  appSecret: "NETEASE_APP_SECRET",
  privateKey: "NETEASE_PRIVATE_KEY",
  channel: "NETEASE_IOT_CHANNEL",
  deviceType: "NETEASE_IOT_DEVICE_TYPE",
  os: "NETEASE_IOT_OS",
  brand: "NETEASE_IOT_BRAND",
  model: "NETEASE_IOT_MODEL",
  appVer: "NETEASE_IOT_APP_VERSION",
  osVer: "NETEASE_IOT_OS_VERSION",
  netStatus: "NETEASE_IOT_NET_STATUS",
};

class IotError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = "IotError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function envValue(name) {
  const value = String(process.env[name] || "").trim();
  return name === "NETEASE_PRIVATE_KEY" ? value.replace(/\\n/g, "\n") : value;
}

function iotConfigStatus() {
  const values = Object.fromEntries(Object.entries(CONFIG_FIELDS).map(([key, name]) => [key, envValue(name)]));
  const missing = Object.entries(CONFIG_FIELDS).filter(([key]) => !values[key]).map(([, name]) => name);
  const invalid = [];
  if (values.appVer && !/^\d{1,4}\.\d{1,4}\.\d{1,4}$/.test(values.appVer)) invalid.push("NETEASE_IOT_APP_VERSION");
  if (values.netStatus && !/^(wifi|2g|3g|4g|5g)$/i.test(values.netStatus)) invalid.push("NETEASE_IOT_NET_STATUS");
  return {
    configured: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
    config: missing.length === 0 && invalid.length === 0 ? values : undefined,
  };
}

function requireIotConfig() {
  const status = iotConfigStatus();
  if (!status.configured) {
    throw new IotError(503, "iot_config_missing", "网易云官方 IOT 歌单参数尚未配置完整", {
      missing: status.missing,
      invalid: status.invalid,
    });
  }
  return status.config;
}

function normalizePrivateKey(value) {
  const text = String(value || "").trim();
  if (/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(text)) return text;
  const compact = text.replace(/\s+/g, "");
  if (!compact) throw new IotError(503, "iot_config_invalid", "网易云 IOT 私钥配置无效");
  const lines = compact.match(/.{1,64}/g) || [];
  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

function signingContent(params) {
  return Object.keys(params)
    .filter(key => key !== "sign" && params[key] !== undefined && params[key] !== null && String(params[key]) !== "")
    .sort()
    .map(key => `${key}=${params[key]}`)
    .join("&");
}

function buildSignedRequest({ config, accessToken, device, bizContent = {}, timestamp = Date.now() }) {
  const params = {
    appId: config.appId,
    appSecret: config.appSecret,
    accessToken,
    bizContent: JSON.stringify(bizContent),
    device: JSON.stringify(device),
    signType: IOT_SIGN_TYPE,
    timestamp: String(timestamp),
  };
  const content = signingContent(params);
  let sign;
  try {
    sign = crypto.sign("RSA-SHA256", Buffer.from(content, "utf8"), normalizePrivateKey(config.privateKey)).toString("base64");
  } catch {
    throw new IotError(503, "iot_config_invalid", "网易云 IOT 私钥无法用于 RSA-SHA256 签名");
  }
  const body = new URLSearchParams();
  for (const key of Object.keys(params).sort()) body.set(key, params[key]);
  body.set("sign", sign);
  return { content, params: { ...params, sign }, body: body.toString() };
}

function decodeStateJson(state, relative) {
  const encoded = state?.files?.[relative];
  if (typeof encoded !== "string") return undefined;
  try { return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")); }
  catch { return undefined; }
}

function extractIotSession(session) {
  const device = decodeStateJson(session?.cliState, ".netease_mcp_device.json") || {};
  const accessToken = device.accessToken || device.access_token || device.token || device.data?.accessToken;
  const rawDeviceId = device.deviceId || device.device_id || device.id;
  if (!accessToken) throw new IotError(401, "login_required", "网易云登录已失效，请重新扫码登录");
  if (!rawDeviceId) throw new IotError(401, "login_required", "网易云设备登录状态已失效，请重新扫码登录");
  return { accessToken: String(accessToken), rawDeviceId: String(rawDeviceId) };
}

function normalizeDeviceId(value, fallback) {
  const raw = String(value || fallback || "");
  if (/^[A-Za-z0-9]{1,64}$/.test(raw)) return raw;
  return crypto.createHash("sha256").update(raw || crypto.randomUUID()).digest("hex").slice(0, 32);
}

function clientIpOf(event) {
  const headers = event?.headers || {};
  const value = headers["x-forwarded-for"] || headers["X-Forwarded-For"] || headers["x-real-ip"] || headers["X-Real-IP"]
    || event?.requestContext?.http?.sourceIp || event?.requestContext?.identity?.sourceIp;
  const ip = String(value || "").split(",")[0].trim().replace(/^\[|\]$/g, "").slice(0, 128);
  if (!ip) throw new IotError(503, "client_ip_unavailable", "CloudBase 未提供调用网易云所需的客户端 IP");
  return ip;
}

function buildDevice(config, event, rawDeviceId, sessionId) {
  return {
    channel: config.channel,
    deviceId: normalizeDeviceId(rawDeviceId, sessionId),
    deviceType: config.deviceType,
    appVer: config.appVer,
    os: config.os,
    osVer: config.osVer,
    brand: config.brand,
    model: config.model,
    clientIp: clientIpOf(event),
    netStatus: config.netStatus.toLowerCase(),
  };
}

function upstreamMessage(payload) {
  return String(payload?.message || payload?.msg || payload?.errorMessage || "");
}

function mapUpstreamError(payload, httpStatus) {
  const code = String(payload?.code ?? payload?.subCode ?? httpStatus ?? "");
  const message = upstreamMessage(payload);
  if (code === "1406" || /accessToken.*(?:过期|失效)|登录.*(?:过期|失效)|重新授权|未登录/i.test(message)) {
    return new IotError(401, "login_required", "网易云登录已失效，请重新扫码登录", { upstreamCode: code });
  }
  if (httpStatus === 429 || code === "429" || /额度|频率|限流|too many|quota/i.test(message)) {
    return new IotError(429, "quota_exceeded", "网易云今日接口额度已达到安全上限", { upstreamCode: code });
  }
  if (httpStatus === 401 || httpStatus === 403 || code === "401" || code === "403" || /无权限|未开通|权限未开放|forbidden|permission/i.test(message)) {
    return new IotError(403, "playlist_permission_denied", "当前网易云应用没有账号歌单读取权限", { upstreamCode: code });
  }
  if (httpStatus === 404 || code === "10007" || /资源不存在|not found/i.test(message)) {
    return new IotError(404, "resource_not_found", "网易云歌单或歌曲资源不存在", { upstreamCode: code });
  }
  if (httpStatus === 400 || code === "400" || /参数错误|非法参数|invalid/i.test(message)) {
    return new IotError(502, "iot_request_rejected", "网易云拒绝了当前 IOT 歌单请求，请核对官方设备参数", { upstreamCode: code });
  }
  return new IotError(502, "iot_upstream_failed", "网易云官方 IOT 歌单服务暂时不可用", { upstreamCode: code });
}

async function callIot(pathName, { session, sessionId, event, bizContent, fetchImpl = globalThis.fetch, timestamp } = {}) {
  const config = requireIotConfig();
  const credentials = extractIotSession(session);
  const device = buildDevice(config, event, credentials.rawDeviceId, sessionId);
  const request = buildSignedRequest({ config, accessToken: credentials.accessToken, device, bizContent, timestamp });
  if (typeof fetchImpl !== "function") throw new IotError(503, "fetch_unavailable", "CloudBase 当前运行时无法访问网易云 IOT 服务");

  await consumeQuota();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), IOT_TIMEOUT_MS);
  let response;
  try {
    response = await fetchImpl(`${IOT_BASE_URL}${pathName}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=utf-8", "Accept": "application/json" },
      body: request.body,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") throw new IotError(504, "iot_timeout", "网易云官方 IOT 歌单服务响应超时");
    throw new IotError(502, "iot_upstream_unavailable", "网易云官方 IOT 歌单服务暂时无法连接");
  } finally {
    clearTimeout(timer);
  }

  let payload;
  try { payload = JSON.parse(await response.text()); }
  catch { throw new IotError(502, "iot_invalid_response", "网易云官方 IOT 歌单服务返回了无效数据"); }
  const success = response.ok && (String(payload?.code) === "200" || payload?.code === undefined);
  if (!success) throw mapUpstreamError(payload, response.status);
  return payload?.data;
}

function rowsOf(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.records)) return data.records;
  if (Array.isArray(data?.list)) return data.list;
  return [];
}

async function fetchPaged(pathName, baseBizContent, context) {
  const output = [];
  let offset = 0;
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const data = await callIot(pathName, { ...context, bizContent: { ...baseBizContent, limit: PAGE_LIMIT, offset } });
    const rows = rowsOf(data);
    output.push(...rows);
    const total = Number(data?.recordCount ?? data?.total ?? data?.count);
    if (!rows.length || rows.length < PAGE_LIMIT || (Number.isFinite(total) && output.length >= total)) break;
    offset += rows.length;
  }
  return output;
}

function mergePlaylists(created, subscribed) {
  const seen = new Set();
  const merged = [];
  for (const [relation, rows] of [["created", created], ["subscribed", subscribed]]) {
    for (const row of rows) {
      const id = String(row?.id || row?.playlistId || row?.originalId || "");
      if (!id || seen.has(id)) continue;
      seen.add(id);
      merged.push({ ...row, accountRelation: relation });
    }
  }
  return merged;
}

async function listAccountPlaylists(session, sessionId, event, options = {}) {
  const context = { session, sessionId, event, fetchImpl: options.fetchImpl, timestamp: options.timestamp };
  const [created, subscribed] = await Promise.all([
    fetchPaged("/openapi/music/basic/playlist/created/get/v2", {}, context),
    fetchPaged("/openapi/music/basic/playlist/subed/get/v2", { originalCoverFlag: false }, context),
  ]);
  return mergePlaylists(created, subscribed);
}

async function getPlaylistTracks(playlistId, session, sessionId, event, options = {}) {
  return fetchPaged("/openapi/music/basic/playlist/song/list/get/v3", {
    playlistId: String(playlistId),
    qualityFlag: false,
  }, { session, sessionId, event, fetchImpl: options.fetchImpl, timestamp: options.timestamp });
}

module.exports = {
  IOT_BASE_URL,
  IotError,
  iotConfigStatus,
  signingContent,
  buildSignedRequest,
  extractIotSession,
  normalizeDeviceId,
  clientIpOf,
  mapUpstreamError,
  callIot,
  fetchPaged,
  mergePlaylists,
  listAccountPlaylists,
  getPlaylistTracks,
};
