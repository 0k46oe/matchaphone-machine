"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

class CliError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const workspaces = new Map();
const MAX_STATE_BYTES = 512 * 1024;
const DEFAULT_TIMEOUT_MS = 30000;

function cliPath() {
  if (process.env.NCM_CLI_BIN) return path.resolve(process.env.NCM_CLI_BIN);
  try {
    const packageFile = require.resolve("@music163/ncm-cli/package.json");
    return path.join(path.dirname(packageFile), "dist", "index.js");
  } catch {
    throw new CliError(503, "cli_missing", "网易云官方 CLI 尚未安装");
  }
}

function config() {
  const appId = String(process.env.NETEASE_APP_ID || "").trim();
  const privateKey = String(process.env.NETEASE_PRIVATE_KEY || "").replace(/\\n/g, "\n").trim();
  const missing = [];
  if (!appId) missing.push("NETEASE_APP_ID");
  if (!privateKey) missing.push("credential");
  if (missing.length) throw new CliError(503, "config_missing", "网易云个人开发者凭证尚未配置");
  const executable = cliPath();
  if (!fs.existsSync(executable)) throw new CliError(503, "cli_missing", "网易云官方 CLI 尚未安装");
  return { appId, privateKey, executable };
}

function safeWorkspaceName(sessionId) {
  return crypto.createHash("sha256").update(String(sessionId || crypto.randomUUID())).digest("hex").slice(0, 32);
}

function isSafeRelative(relative) {
  if (!relative || path.isAbsolute(relative)) return false;
  const normalized = path.normalize(relative);
  return normalized !== ".." && !normalized.startsWith(`..${path.sep}`);
}

async function restoreState(home, state) {
  const files = state && typeof state === "object" ? state.files : undefined;
  if (!files || typeof files !== "object") return;
  for (const [relative, encoded] of Object.entries(files)) {
    if (!isSafeRelative(relative) || !shouldPersist(relative) || typeof encoded !== "string") continue;
    const target = path.join(home, relative);
    await fsp.mkdir(path.dirname(target), { recursive: true });
    await fsp.writeFile(target, Buffer.from(encoded, "base64"));
  }
}

function shouldPersist(relative) {
  const normalized = relative.replace(/\\/g, "/");
  return normalized === ".netease_mcp_device.json"
    || normalized === ".config/ncm-cli/cache/manifest.json";
}

async function collectFiles(root, current = root, output = {}) {
  let entries = [];
  try { entries = await fsp.readdir(current, { withFileTypes: true }); } catch { return output; }
  for (const entry of entries) {
    const full = path.join(current, entry.name);
    if (entry.isDirectory()) await collectFiles(root, full, output);
    else if (entry.isFile()) {
      const relative = path.relative(root, full);
      if (!shouldPersist(relative)) continue;
      const normalized = relative.replace(/\\/g, "/");
      const bytes = await fsp.readFile(full);
      output[normalized] = bytes.toString("base64");
    }
  }
  return output;
}

async function snapshotState(home) {
  const files = await collectFiles(home);
  const bytes = Buffer.byteLength(JSON.stringify(files));
  if (bytes > MAX_STATE_BYTES) throw new CliError(500, "session_state_too_large", "网易云登录状态异常，请重新登录");
  return { version: 2, files };
}

async function workspace(sessionId, state) {
  const key = safeWorkspaceName(sessionId);
  let home = workspaces.get(key);
  if (!home) {
    home = path.join(os.tmpdir(), "chacha-ncm-cli", key);
    await fsp.mkdir(home, { recursive: true });
    await restoreState(home, state);
    workspaces.set(key, home);
  }
  return home;
}

function parseJsonOutput(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed) return undefined;
  try { return JSON.parse(trimmed); } catch {}
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start >= 0 && end > start) {
    try { return JSON.parse(trimmed.slice(start, end + 1)); } catch {}
  }
  return undefined;
}

function safeFailure(text, status) {
  const value = String(text || "");
  if (/unknown command|unknown option|not found|未知命令|无此命令/i.test(value)) return new CliError(501, "capability_unavailable", "当前个人开发者权限未开放此项网易云能力");
  if (/请求总量超限|额度|quota|too many requests/i.test(value)) return new CliError(429, "quota_exceeded", "网易云今日接口额度已达到安全上限");
  if (/未登录|未授权|请先登录|login required/i.test(value)) return new CliError(401, "login_required", "请先登录网易云音乐");
  if (/API key|appId|PRIVATE_KEY|privateKey|凭证/i.test(value)) return new CliError(503, "config_invalid", "网易云个人开发者凭证无效或格式不正确");
  if (/网络|network|timeout|ECONN|ENOTFOUND|fetch failed/i.test(value)) return new CliError(502, "upstream_unavailable", "网易云服务暂时无法连接");
  if (status === null) return new CliError(504, "cli_timeout", "网易云官方 CLI 响应超时");
  return new CliError(502, "cli_failed", "网易云官方 CLI 请求失败");
}

function execute(executable, home, args, timeoutMs = DEFAULT_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [executable, ...args], {
      cwd: home,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        XDG_CONFIG_HOME: path.join(home, ".config"),
        NO_COLOR: "1",
      },
      shell: false,
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "", stderr = "", killed = false;
    const timer = setTimeout(() => { killed = true; child.kill("SIGKILL"); }, timeoutMs);
    child.stdout.on("data", chunk => { if (stdout.length < 2_000_000) stdout += chunk.toString("utf8"); });
    child.stderr.on("data", chunk => { if (stderr.length < 200_000) stderr += chunk.toString("utf8"); });
    child.on("error", () => { clearTimeout(timer); reject(new CliError(503, "cli_spawn_failed", "网易云官方 CLI 无法启动")); });
    child.on("close", code => {
      clearTimeout(timer);
      const json = parseJsonOutput(stdout);
      if (killed) return reject(safeFailure("", null));
      if (code !== 0) return reject(safeFailure(`${stdout}\n${stderr}`, code));
      resolve({ code, stdout, stderr, json });
    });
  });
}

async function primeCredentials(cfg, home) {
  await execute(cfg.executable, home, ["config", "set", "appId", cfg.appId], 10000);
  const escapedKey = cfg.privateKey.replace(/\r?\n/g, "\\n");
  await execute(cfg.executable, home, ["config", "set", "privateKey", "--", escapedKey], 10000);
}

async function runCli(sessionId, state, args, options = {}) {
  const cfg = config();
  const home = await workspace(sessionId, state);
  await primeCredentials(cfg, home);
  const result = await execute(cfg.executable, home, args, options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const nextState = await snapshotState(home);
  return { ...result, state: nextState, home };
}

async function clearWorkspace(sessionId) {
  const key = safeWorkspaceName(sessionId);
  const home = workspaces.get(key) || path.join(os.tmpdir(), "chacha-ncm-cli", key);
  workspaces.delete(key);
  try { await fsp.rm(home, { recursive: true, force: true }); } catch {}
}

function messageOf(result) {
  return String(result?.json?.message || result?.json?.msg || result?.stderr || result?.stdout || "");
}

function resultData(result) {
  return result?.json?.data ?? result?.json?.result ?? result?.json;
}

function extractUrls(value, output = []) {
  if (typeof value === "string") {
    for (const match of value.matchAll(/https?:\/\/[^\s"'<>]+/g)) output.push(match[0].replace(/[),.;]+$/, ""));
  } else if (Array.isArray(value)) value.forEach(item => extractUrls(item, output));
  else if (value && typeof value === "object") Object.values(value).forEach(item => extractUrls(item, output));
  return output;
}

function extractQr(result) {
  const data = resultData(result);
  const urls = extractUrls(data).concat(extractUrls(messageOf(result)));
  const qrUrl = data?.qrCodeUrl || data?.qrUrl || data?.url || urls.find(url => /163|music|qr|login/i.test(url)) || urls[0];
  const key = data?.uniKey || data?.unikey || data?.key || data?.qrKey;
  return { qrUrl: qrUrl ? String(qrUrl) : undefined, providerKey: key ? String(key) : undefined };
}

function walk(value, visitor, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  visitor(value);
  if (Array.isArray(value)) value.forEach(item => walk(item, visitor, seen));
  else Object.values(value).forEach(item => walk(item, visitor, seen));
}

function extractProfile(result) {
  let found;
  walk(resultData(result), value => {
    if (found || Array.isArray(value)) return;
    const nickname = value.nickname || value.nickName || value.userName || value.username;
    const userId = value.userId || value.uid || value.id;
    if (nickname || userId) found = { userId: String(userId || "netease-user"), nickname: String(nickname || "网易云用户"), avatarUrl: value.avatarUrl || value.avatar || value.profileImgUrl };
  });
  return found;
}

function loginStatus(result, expiresAt) {
  if (expiresAt && expiresAt <= Date.now()) return "expired";
  const text = `${messageOf(result)} ${JSON.stringify(result?.json || {})}`;
  if (/已扫码|等待确认|scanned|confirm/i.test(text)) return "scanned";
  if (/已登录|登录成功|authorized|successfully logged/i.test(text) || result?.json?.authenticated === true || result?.json?.data?.accessToken) return "authorized";
  if (/过期|expired|失效/i.test(text)) return "expired";
  return "waiting";
}

module.exports = {
  CliError,
  config,
  runCli,
  clearWorkspace,
  resultData,
  messageOf,
  extractQr,
  extractProfile,
  loginStatus,
  parseJsonOutput,
  shouldPersist,
  snapshotState,
};