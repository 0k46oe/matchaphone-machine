"use strict";

const { cached } = require("./cache");
const { loadSession, saveSession, clearSession, cookieHeader, validSessionId } = require("./session");
const { randomId } = require("./crypto");
const { consumeQuota } = require("./quota");
const {
  IotError,
  iotConfigStatus,
  listAccountPlaylists,
  getPlaylistTracks,
} = require("./iot");
const {
  CliError,
  config: cliConfig,
  runCli,
  clearWorkspace,
  resultData,
  extractQr,
  extractProfile,
  loginStatus,
} = require("./cli");

class GatewayError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function json(statusCode, body, headers = {}) {
  return { statusCode, headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers }, body: JSON.stringify(body) };
}

function corsHeaders(event) {
  const origin = event.headers?.origin || event.headers?.Origin || "";
  const configured = String(process.env.MUSIC_ALLOWED_ORIGINS || "https://matchaphone-d5gjgy87ybfb50382-1463048417.tcloudbaseapp.com,http://localhost:5173,http://127.0.0.1:5173").split(",").map(item => item.trim());
  return configured.includes(origin) ? {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Credentials": "true",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Vary": "Origin",
  } : {};
}

function pathOf(event) {
  const raw = event.path || event.rawPath || event.requestContext?.http?.path || "/";
  return raw.replace(/^\/api\/music/, "") || "/";
}
function methodOf(event) { return String(event.httpMethod || event.requestContext?.http?.method || "GET").toUpperCase(); }
function queryOf(event) { return event.queryStringParameters || Object.fromEntries(new URLSearchParams(event.rawQueryString || "")); }
function bodyOf(event) {
  if (!event.body) return {};
  try { return typeof event.body === "string" ? JSON.parse(event.body) : event.body; }
  catch { throw new GatewayError(400, "invalid_body", "请求正文不是有效 JSON"); }
}
function cookieOf(event) { return event.headers?.cookie || event.headers?.Cookie || ""; }
function bearerSessionOf(event) {
  const header = event.headers?.authorization || event.headers?.Authorization || "";
  const match = String(header).match(/^Bearer\s+([A-Za-z0-9_-]+)$/i);
  return match ? validSessionId(match[1]) : undefined;
}

function gatewayConfig() {
  cliConfig();
  const secret = String(process.env.MUSIC_SESSION_ENCRYPTION_KEY || "");
  if (secret.length < 24) throw new GatewayError(503, "config_missing", "音乐会话加密密钥尚未配置");
  return { secret };
}

function parseShare(url) {
  let parsed;
  try { parsed = new URL(url); } catch { throw new GatewayError(400, "invalid_link", "链接格式不正确"); }
  if (!/(^|\.)music\.163\.com$|(^|\.)163cn\.tv$/i.test(parsed.hostname)) throw new GatewayError(400, "unsupported_link", "不是受支持的网易云分享链接");
  const text = parsed.pathname + parsed.search + parsed.hash;
  const id = parsed.searchParams.get("id") || text.match(/(?:song|playlist|album)\/(\d+)/)?.[1];
  const kind = /playlist/i.test(text) ? "playlist" : /album/i.test(text) ? "album" : "track";
  if (!id) throw new GatewayError(400, "invalid_link", "无法识别分享链接中的资源 ID");
  return { kind, id };
}

function firstValue(row, keys) {
  for (const key of keys) if (row?.[key] !== undefined && row?.[key] !== null && row?.[key] !== "") return row[key];
}

function mapTrack(row) {
  const time = Date.now();
  const encryptedId = firstValue(row, ["encryptedId", "encryptId", "encrypted_id", "resourceId"]);
  const originalId = firstValue(row, ["originalId", "songId", "original_id", "id"]);
  const externalId = String(originalId || encryptedId || randomId(8));
  const artistSource = row.artists || row.ar || row.artist || row.singers || [];
  const artists = (Array.isArray(artistSource) ? artistSource : [artistSource]).map(item => String(item?.name || item?.artistName || item || "")).filter(Boolean);
  const albumRow = row.album || row.al;
  return {
    id: `netease:${externalId}`,
    source: "netease",
    externalId,
    encryptedId: encryptedId ? String(encryptedId) : undefined,
    originalId: originalId ? String(originalId) : undefined,
    title: String(row.name || row.title || row.songName || "未知歌曲"),
    artists: artists.length ? artists : ["未知歌手"],
    album: String(albumRow?.name || row.albumName || (typeof albumRow === "string" ? albumRow : "")) || undefined,
    coverUrl: row.coverUrl || row.coverImgUrl || row.picUrl || albumRow?.picUrl,
    durationMs: Number(row.durationMs || row.duration || row.dt) || undefined,
    unavailableReason: row.visible === false || row.playFlag === false
      ? "当前歌曲受版权、地区或账号权限限制"
      : undefined,
    importedAt: time,
    createdAt: time,
    updatedAt: time,
    schemaVersion: 1,
  };
}

function mapPlaylist(row) {
  const time = Date.now();
  const externalId = String(firstValue(row, ["originalId", "playlistId", "id", "encryptedId"]) || randomId(8));
  return {
    id: `netease-playlist:${externalId}`,
    source: "netease",
    externalId,
    name: String(row.name || row.title || row.playlistName || "网易云歌单"),
    description: row.description || row.describe || undefined,
    coverUrl: row.coverUrl || row.coverImgUrl || row.picUrl,
    trackIds: [],
    ownerName: row.ownerName || row.creatorNickName || row.creator?.nickname || row.user?.nickname,
    syncedAt: time,
    createdAt: time,
    updatedAt: time,
    schemaVersion: 1,
  };
}

function collectArrays(value, predicate, output = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    if (value.some(item => item && typeof item === "object" && predicate(item))) output.push(value);
    value.forEach(item => collectArrays(item, predicate, output, seen));
  } else Object.values(value).forEach(item => collectArrays(item, predicate, output, seen));
  return output;
}

function trackRows(data) {
  const arrays = collectArrays(data, row => Boolean(row.name || row.title || row.songName) && Boolean(row.id || row.songId || row.originalId || row.encryptedId));
  return (arrays.sort((a, b) => b.length - a.length)[0] || []).filter(row => row && typeof row === "object");
}
function playlistRows(data) {
  const arrays = collectArrays(data, row => Boolean(row.name || row.title || row.playlistName) && Boolean(row.trackCount !== undefined || row.playlistId || row.creator || row.coverImgUrl));
  return (arrays.sort((a, b) => b.length - a.length)[0] || []).filter(row => row && typeof row === "object");
}

function findUrl(value, seen = new Set()) {
  if (typeof value === "string" && /^https?:\/\//i.test(value)) return value;
  if (!value || typeof value !== "object" || seen.has(value)) return undefined;
  seen.add(value);
  const preferred = [value.url, value.playUrl, value.streamUrl, value.downloadUrl].find(item => typeof item === "string" && /^https?:\/\//i.test(item));
  if (preferred) return preferred;
  for (const child of Object.values(value)) { const found = findUrl(child, seen); if (found) return found; }
}

function findLyrics(value, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return {};
  seen.add(value);
  const lrc = value.lrc?.lyric || value.lrc || value.lyric || value.lyrics;
  const translatedLrc = value.tlyric?.lyric || value.translatedLrc || value.translation;
  if (typeof lrc === "string" || typeof translatedLrc === "string") return { lrc: typeof lrc === "string" ? lrc : undefined, translatedLrc: typeof translatedLrc === "string" ? translatedLrc : undefined };
  for (const child of Object.values(value)) { const found = findLyrics(child, seen); if (found.lrc || found.translatedLrc) return found; }
  return {};
}

function userInput(value) { return String(value || "").replace(/[\r\n]+/g, " ").slice(0, 120); }

async function runAndSave(loaded, session, secret, args, options) {
  const id = loaded.id || randomId();
  const result = await runCli(id, session.cliState, args, options);
  session.cliState = result.state;
  await saveSession(id, session, secret);
  return { id, result };
}

const CAPABILITY_DEFINITIONS = {
  search: {
    label: "歌曲搜索",
    candidates: [["search", "song"]],
  },
  playlists: {
    label: "账号歌单导入",
    candidates: [["playlist", "list"], ["playlist", "mine"], ["user", "playlist"]],
  },
  lyrics: {
    label: "歌词",
    candidates: [["lyric"], ["song", "lyric"], ["lyrics"]],
  },
  stream: {
    label: "浏览器播放地址",
    candidates: [["song", "url"], ["stream"], ["url"]],
  },
};

function commandTokens(args) {
  const optionIndex = args.findIndex(value => String(value).startsWith("--"));
  return args.slice(0, optionIndex < 0 ? args.length : optionIndex)
    .map(value => String(value).trim().toLowerCase())
    .filter(Boolean);
}

function normalizeCommandPath(value) {
  const text = String(value || "")
    .replace(/^\s*(?:[-*•>]+|\d+[.)])\s*/, "")
    .replace(/^ncm-cli\s+/i, "")
    .trim();
  if (!text) return "";
  const beforeOptions = text.split(/\s+--|\s{2,}|\t|\s+[—–-]\s+/)[0];
  const tokens = beforeOptions.match(/^[a-z][a-z0-9-]*(?:\s+[a-z][a-z0-9-]*){0,3}/i)?.[0];
  return String(tokens || "").toLowerCase();
}

function collectCommandPaths(value, parent = [], output = new Set(), seen = new Set()) {
  if (typeof value === "string") {
    for (const line of value.split(/\r?\n/)) {
      const normalized = normalizeCommandPath(line);
      if (normalized) output.add(normalized);
    }
    return output;
  }
  if (!value || typeof value !== "object" || seen.has(value)) return output;
  seen.add(value);
  if (Array.isArray(value)) {
    for (const item of value) collectCommandPaths(item, parent, output, seen);
    return output;
  }

  const explicit = value.command || value.fullCommand || value.commandPath || value.usage || value.syntax;
  if (typeof explicit === "string") {
    const normalized = normalizeCommandPath(explicit);
    if (normalized) output.add(normalized);
  }

  const rawName = typeof value.name === "string" ? value.name : typeof value.commandName === "string" ? value.commandName : "";
  const name = normalizeCommandPath(rawName);
  const ownPath = name ? [...parent, ...name.split(/\s+/)] : parent;
  if (ownPath.length && ownPath.length <= 4) output.add(ownPath.join(" "));

  const childKeys = new Set(["commands", "subcommands", "children", "items", "actions"]);
  for (const [key, child] of Object.entries(value)) {
    if (childKeys.has(key) && child && typeof child === "object" && !Array.isArray(child)) {
      for (const [childName, nested] of Object.entries(child)) {
        const normalizedChildName = normalizeCommandPath(childName);
        collectCommandPaths(nested, normalizedChildName ? [...ownPath, ...normalizedChildName.split(/\s+/)] : ownPath, output, seen);
      }
    } else if (childKeys.has(key)) collectCommandPaths(child, ownPath, output, seen);
    else if (!["name", "commandName", "command", "fullCommand", "commandPath", "usage", "syntax"].includes(key)) collectCommandPaths(child, parent, output, seen);
  }
  return output;
}

function commandPathsFromState(state) {
  const encoded = state?.files?.[".config/ncm-cli/cache/manifest.json"];
  if (typeof encoded !== "string") return new Set();
  try {
    const manifest = JSON.parse(Buffer.from(encoded, "base64").toString("utf8"));
    return collectCommandPaths(manifest);
  } catch {
    return new Set();
  }
}

function parseAvailableCommands(result) {
  const paths = collectCommandPaths(result?.json);
  collectCommandPaths(result?.stdout, [], paths);
  collectCommandPaths(result?.stderr, [], paths);
  for (const path of commandPathsFromState(result?.state)) paths.add(path);
  return paths;
}

function candidateSupported(commandPaths, args) {
  const candidate = commandTokens(args).join(" ");
  if (!candidate) return false;
  for (const path of commandPaths) {
    if (path === candidate || path.startsWith(candidate + " ")) return true;
  }
  // Some official `commands --output json` payloads flatten parent and child names
  // into separate entries. Require every command token to be present before treating
  // a composed command such as `playlist list` as registered.
  const singleTokens = new Set([...commandPaths].filter(path => !String(path).includes(" ")));
  return commandTokens(args).every(token => singleTokens.has(token));
}

function inferCapability(candidates) {
  const roots = candidates.map(args => commandTokens(args).join(" "));
  if (roots.some(root => root === "search" || root.startsWith("search ") || root === "song detail")) return "search";
  if (roots.some(root => root === "playlist" || root.startsWith("playlist ") || root === "user playlist")) return "playlists";
  if (roots.some(root => root === "lyric" || root === "lyrics" || /\blyric$/.test(root))) return "lyrics";
  if (roots.some(root => root === "stream" || root === "url" || /\burl$/.test(root))) return "stream";
  return "report";
}

function capabilityError(key) {
  const label = CAPABILITY_DEFINITIONS[key]?.label || "当前功能";
  return new GatewayError(501, "capability_unavailable", `当前个人开发者权限未开放“${label}”功能`, { capability: key, reason: "official_cli_command_missing" });
}

async function ensureAuthenticatedCli(loaded, session, secret, force = false) {
  if (!session.authenticated || !loaded.id) return;
  if (!force && session.cliLoginCheckedAt > Date.now() - 5 * 60 * 1000) return;
  let result;
  try {
    ({ result } = await runAndSave(loaded, session, secret, ["login", "--check", "--output", "json"], { timeoutMs: 20000 }));
  } catch (error) {
    if (error?.code === "login_required") {
      session.authenticated = false;
      session.cliCapabilities = undefined;
      await saveSession(loaded.id, session, secret);
    }
    throw error;
  }
  // A successful CLI exit is sufficient here. Repeated `login --check` calls may not
  // repeat the QR-specific "authorized" wording even though the token remains valid.
  session.cliLoginCheckedAt = Date.now();
  session.profile = extractProfile(result) || session.profile;
  await saveSession(loaded.id, session, secret);
}
async function availableCliCommands(loaded, session, secret, force = false) {
  await ensureAuthenticatedCli(loaded, session, secret, force);
  const cachedPaths = session.cliCapabilities?.commandPaths;
  if (!force && Array.isArray(cachedPaths) && session.cliCapabilities.checkedAt > Date.now() - 5 * 60 * 1000) return new Set(cachedPaths);

  let paths = commandPathsFromState(session.cliState);
  try {
    const { result } = await runAndSave(loaded, session, secret, ["commands", "--output", "json"], { timeoutMs: 30000 });
    const discovered = parseAvailableCommands(result);
    if (discovered.size) paths = discovered;
  } catch (error) {
    if (!paths.size && error?.code !== "capability_unavailable") throw error;
  }

  session.cliCapabilities = { checkedAt: Date.now(), commandPaths: [...paths].sort() };
  if (loaded.id) await saveSession(loaded.id, session, secret);
  return paths;
}

function capabilityResponse(session, commandPaths, iotStatus = iotConfigStatus()) {
  const authenticated = Boolean(session.authenticated);
  const reasons = {};
  const response = { authenticated, search: false, playlists: false, lyrics: false, stream: false, reasons };
  for (const [key, definition] of Object.entries(CAPABILITY_DEFINITIONS)) {
    const cliSupported = authenticated && definition.candidates.some(args => candidateSupported(commandPaths, args));
    let supported = cliSupported;
    if (key === "playlists") {
      supported = authenticated && !session.iotPlaylistPermissionDenied && (iotStatus.configured || cliSupported);
    }
    response[key] = supported;
    if (supported) continue;
    if (!authenticated) {
      reasons[key] = `登录网易云后才能使用“${definition.label}”`;
    } else if (key === "playlists" && session.iotPlaylistPermissionDenied) {
      reasons[key] = session.iotPlaylistPermissionDenied.message || "当前网易云应用没有账号歌单读取权限";
    } else if (key === "playlists" && !iotStatus.configured && !cliSupported) {
      reasons[key] = "等待在 CloudBase 配置网易云官方 IOT 歌单参数";
    } else {
      reasons[key] = `官方 CLI 登录会话未注册“${definition.label}”命令`;
    }
  }
  return response;
}

function trustedOptimisticCandidates(capability, candidates) {
  if (capability !== "search") return [];
  return candidates.filter(args => commandTokens(args).join(" ") === "search song");
}
async function runCapability(loaded, session, secret, candidates, options) {
  await ensureAuthenticatedCli(loaded, session, secret);
  const capability = inferCapability(candidates);
  let available = await availableCliCommands(loaded, session, secret);
  let supportedCandidates = candidates.filter(args => candidateSupported(available, args));
  if (!supportedCandidates.length) {
    available = await availableCliCommands(loaded, session, secret, true);
    supportedCandidates = candidates.filter(args => candidateSupported(available, args));
  }
  if (!supportedCandidates.length) supportedCandidates = trustedOptimisticCandidates(capability, candidates);
  if (!supportedCandidates.length) throw capabilityError(capability);
  let last;
  for (const args of supportedCandidates) {
    try {
      const executed = await runAndSave(loaded, session, secret, args.includes("--output") ? args : [...args, "--output", "json"], options);
      const commandPath = commandTokens(args).join(" ");
      const cached = new Set(session.cliCapabilities?.commandPaths || []);
      if (commandPath && !cached.has(commandPath)) {
        cached.add(commandPath);
        session.cliCapabilities = { checkedAt: Date.now(), commandPaths: [...cached].sort() };
        if (loaded.id) await saveSession(loaded.id, session, secret);
      }
      return executed;
    } catch (error) {
      last = error;
      if (error?.code !== "capability_unavailable") throw error;
    }
  }
  throw last?.code === "capability_unavailable" ? capabilityError(capability) : last || capabilityError(capability);
}
async function runIotWithLoginRefresh(loaded, session, secret, operation) {
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const value = await operation();
      if (session.iotPlaylistPermissionDenied) {
        delete session.iotPlaylistPermissionDenied;
        if (loaded.id) await saveSession(loaded.id, session, secret);
      }
      return value;
    } catch (error) {
      lastError = error;
      if (error?.code === "login_required" && attempt === 0) {
        try {
          await ensureAuthenticatedCli(loaded, session, secret, true);
          continue;
        } catch (refreshError) {
          lastError = refreshError;
        }
      }
      break;
    }
  }

  if (lastError?.code === "login_required") {
    session.authenticated = false;
    session.cliCapabilities = undefined;
    delete session.ownedPlaylistIds;
    delete session.playlistRefs;
    if (loaded.id) await saveSession(loaded.id, session, secret);
    throw new GatewayError(401, "login_required", "网易云登录已失效，请重新扫码登录");
  }
  if (lastError?.code === "playlist_permission_denied") {
    session.iotPlaylistPermissionDenied = { message: lastError.message, checkedAt: Date.now() };
    if (loaded.id) await saveSession(loaded.id, session, secret);
  }
  throw lastError;
}

function requireLogin(session) {
  if (!session.authenticated) throw new GatewayError(401, "login_required", "请先登录网易云音乐");
}

async function rememberTracks(loaded, session, secret, tracks) {
  const entries = Object.entries(session.trackRefs || {});
  const refs = Object.fromEntries(entries.slice(-180));
  for (const track of tracks) refs[track.externalId] = { encryptedId: track.encryptedId, originalId: track.originalId || track.externalId };
  session.trackRefs = refs;
  if (loaded.id) await saveSession(loaded.id, session, secret);
}

function trackIdArgs(session, id) {
  const ref = session.trackRefs?.[id] || {};
  const args = [];
  if (ref.encryptedId) args.push("--encrypted-id", String(ref.encryptedId));
  args.push("--original-id", String(ref.originalId || id));
  return args;
}

async function route(event) {
  const pathName = pathOf(event), method = methodOf(event), query = queryOf(event), body = bodyOf(event);
  if (pathName === "/health") {
    const playlistStatus = iotConfigStatus();
    const playlistHealth = {
      playlistMode: "official-iot-rest",
      playlistConfigured: playlistStatus.configured,
      missingPlaylistConfig: playlistStatus.missing,
      invalidPlaylistConfig: playlistStatus.invalid,
    };
    try { gatewayConfig(); return json(200, { ok: true, configured: true, mode: "official-personal-cli", ...playlistHealth }); }
    catch (error) { return json(200, { ok: true, configured: false, mode: "official-personal-cli", code: error.code || "config_missing", ...playlistHealth }); }
  }

  const secret = process.env.MUSIC_SESSION_ENCRYPTION_KEY;
  const loaded = await loadSession(cookieOf(event), secret, bearerSessionOf(event));
  const session = loaded.data || {};

  if (pathName === "/auth/session" && method === "GET") return json(200, { authenticated: Boolean(session.authenticated), profile: session.profile });

  if (pathName === "/capabilities" && method === "GET") {
    const playlistStatus = iotConfigStatus();
    if (query.refresh === "1" && session.iotPlaylistPermissionDenied) {
      delete session.iotPlaylistPermissionDenied;
      if (loaded.id) await saveSession(loaded.id, session, secret);
    }
    if (!session.authenticated) return json(200, capabilityResponse(session, new Set(), playlistStatus));
    const commands = await availableCliCommands(loaded, session, secret, query.refresh === "1");
    return json(200, capabilityResponse(session, commands, playlistStatus));
  }
  if (pathName === "/auth/logout" && method === "POST") {
    if (loaded.id) {
      try { await runCli(loaded.id, session.cliState, ["logout", "--output", "json"], { timeoutMs: 15000 }); } catch {}
      await clearWorkspace(loaded.id);
      await clearSession(loaded.id);
    }
    return json(200, { ok: true }, { "Set-Cookie": cookieHeader("", 0) });
  }

  if (pathName === "/auth/qr" && method === "POST") {
    gatewayConfig();
    await consumeQuota();
    const id = loaded.id || randomId();
    const qrKey = randomId(16), expiresAt = Date.now() + 5 * 60 * 1000;
    const result = await runCli(id, session.cliState, ["login", "--background", "--output", "json"], { timeoutMs: 35000 });
    const qr = extractQr(result);
    if (!qr.qrUrl) throw new GatewayError(502, "qr_unavailable", "网易云没有返回可用的登录二维码，请稍后重试");
    const next = { ...session, authenticated: false, profile: undefined, cliCapabilities: undefined, cliState: result.state, qr: { key: qrKey, providerKey: qr.providerKey, expiresAt } };
    await saveSession(id, next, secret);
    return json(200, { key: qrKey, qrUrl: qr.qrUrl, expiresAt, sessionHandle: id }, { "Set-Cookie": cookieHeader(id) });
  }

  if (pathName === "/auth/qr/status" && method === "GET") {
    gatewayConfig();
    if (!loaded.id || !session.qr || String(query.key || "") !== session.qr.key) throw new GatewayError(400, "invalid_qr", "登录二维码状态无效，请重新获取");
    if (session.qr.expiresAt <= Date.now()) return json(200, { status: "expired" });
    const { result } = await runAndSave(loaded, session, secret, ["login", "--check", "--output", "json"], { timeoutMs: 15000 });
    const status = loginStatus(result, session.qr.expiresAt);
    if (status === "authorized") {
      session.authenticated = true;
      session.profile = extractProfile(result) || session.profile || { userId: "netease-user", nickname: "网易云用户" };
      session.cliCapabilities = undefined;
      delete session.qr;
      await saveSession(loaded.id, session, secret);
    }
    return json(200, { status, profile: status === "authorized" ? session.profile : undefined });
  }

  if (pathName === "/me/profile" && method === "GET") {
    requireLogin(session);
    return json(200, { profile: session.profile || { userId: "netease-user", nickname: "网易云用户" } });
  }

  if (pathName === "/me/playlists" && method === "GET") {
    requireLogin(session);
    const playlistStatus = iotConfigStatus();
    let playlists;
    if (playlistStatus.configured) {
      if (session.iotPlaylistPermissionDenied && query.refresh !== "1") {
        throw new IotError(403, "playlist_permission_denied", session.iotPlaylistPermissionDenied.message || "当前网易云应用没有账号歌单读取权限");
      }
      if (query.refresh === "1") delete session.iotPlaylistPermissionDenied;
      const rows = await runIotWithLoginRefresh(loaded, session, secret, () => listAccountPlaylists(session, loaded.id, event));
      playlists = rows.map(mapPlaylist);
    } else {
      await consumeQuota();
      const { result } = await runCapability(loaded, session, secret, [
        ["playlist", "list", "--userInput", "查看我的网易云歌单"],
        ["playlist", "mine", "--userInput", "查看我的网易云歌单"],
        ["user", "playlist", "--userInput", "查看我的网易云歌单"],
      ]);
      playlists = playlistRows(resultData(result)).map(mapPlaylist);
    }
    session.ownedPlaylistIds = playlists.map(item => String(item.externalId || "")).filter(Boolean);
    session.playlistRefs = Object.fromEntries(playlists.map(item => [String(item.externalId || ""), item]).filter(([id]) => id));
    if (loaded.id) await saveSession(loaded.id, session, secret);
    return json(200, { playlists });
  }

  const playlistMatch = pathName.match(/^\/playlists\/([^/]+)$/);
  if (playlistMatch && method === "GET") {
    requireLogin(session);
    const playlistId = decodeURIComponent(playlistMatch[1]);
    if (!Array.isArray(session.ownedPlaylistIds) || !session.ownedPlaylistIds.includes(playlistId)) {
      throw new GatewayError(403, "playlist_not_owned", "只能导入当前登录账号自己的网易云歌单");
    }
    const playlistStatus = iotConfigStatus();
    let tracks;
    let playlist;
    if (playlistStatus.configured) {
      const rows = await runIotWithLoginRefresh(loaded, session, secret, () => getPlaylistTracks(playlistId, session, loaded.id, event));
      tracks = rows.map(mapTrack);
      const saved = session.playlistRefs?.[playlistId] || mapPlaylist({ id: playlistId, name: "网易云歌单" });
      playlist = { ...saved, externalId: playlistId, id: `netease-playlist:${playlistId}`, trackIds: tracks.map(track => track.id), syncedAt: Date.now(), updatedAt: Date.now() };
    } else {
      await consumeQuota();
      const { result } = await runCapability(loaded, session, secret, [
        ["playlist", "detail", "--original-id", playlistId, "--userInput", "查看网易云歌单详情"],
        ["playlist", "get", "--original-id", playlistId, "--userInput", "查看网易云歌单详情"],
        ["playlist", "show", "--original-id", playlistId, "--userInput", "查看网易云歌单详情"],
      ]);
      const data = resultData(result);
      tracks = trackRows(data).map(mapTrack);
      const row = playlistRows(data)[0] || { id: playlistId, name: "网易云歌单" };
      playlist = { ...mapPlaylist(row), externalId: playlistId, id: `netease-playlist:${playlistId}`, trackIds: tracks.map(track => track.id) };
    }
    await rememberTracks(loaded, session, secret, tracks);
    return json(200, { playlist, tracks });
  }

  if (pathName === "/search" && method === "GET") {
    requireLogin(session);
    const q = String(query.q || "").trim();
    if (!q) throw new GatewayError(400, "invalid_query", "请输入搜索关键词");
    await consumeQuota();
    const limit = Math.min(50, Math.max(1, Number(query.limit) || 30));
    const offset = Math.max(0, Number(query.offset) || 0);
    const { result } = await runCapability(loaded, session, secret, [["search", "song", "--keyword", q, "--limit", String(limit), "--offset", String(offset), "--userInput", userInput(`搜索歌曲：${q}`)]]);
    const rows = trackRows(resultData(result)), tracks = rows.map(mapTrack);
    await rememberTracks(loaded, session, secret, tracks);
    return json(200, { tracks, total: Number(resultData(result)?.total || resultData(result)?.count || rows.length) });
  }

  const lyricsMatch = pathName.match(/^\/tracks\/([^/]+)\/lyrics$/);
  if (lyricsMatch && method === "GET") {
    requireLogin(session);
    await consumeQuota();
    const id = decodeURIComponent(lyricsMatch[1]), idArgs = trackIdArgs(session, id);
    const value = await cached(`cli-lyrics:${id}`, 24 * 60 * 60 * 1000, async () => {
      const { result } = await runCapability(loaded, session, secret, [
        ["lyric", ...idArgs, "--userInput", "获取当前歌曲歌词"],
        ["song", "lyric", ...idArgs, "--userInput", "获取当前歌曲歌词"],
        ["lyrics", ...idArgs, "--userInput", "获取当前歌曲歌词"],
      ]);
      return findLyrics(resultData(result));
    });
    return json(200, value);
  }

  const streamMatch = pathName.match(/^\/tracks\/([^/]+)\/stream$/);
  if (streamMatch && method === "GET") {
    requireLogin(session);
    await consumeQuota();
    const id = decodeURIComponent(streamMatch[1]), idArgs = trackIdArgs(session, id);
    const { result } = await runCapability(loaded, session, secret, [
      ["song", "url", ...idArgs, "--userInput", "获取当前歌曲播放地址"],
      ["stream", ...idArgs, "--userInput", "获取当前歌曲播放地址"],
      ["url", ...idArgs, "--userInput", "获取当前歌曲播放地址"],
    ]);
    const data = resultData(result), url = findUrl(data);
    if (!url) throw new GatewayError(501, "capability_unavailable", "当前个人开发者权限未开放浏览器播放地址");
    return json(200, { url, expiresAt: Number(data?.expiresAt || data?.expireTime) || undefined, openUrl: `https://music.163.com/#/song?id=${encodeURIComponent(id)}` });
  }

  if (pathName === "/resolve" && method === "POST") {
    const parsed = parseShare(body.url);
    if (parsed.kind === "playlist") {
      throw new GatewayError(400, "playlist_link_unsupported", "暂不支持通过链接导入歌单，请从“我的网易云歌单”导入当前账号自己的歌单");
    }
    requireLogin(session);
    await consumeQuota();
    const { result } = await runCapability(loaded, session, secret, [
      ["song", "detail", "--original-id", parsed.id, "--userInput", "导入网易云分享歌曲"],
      ["search", "song", "--keyword", parsed.id, "--userInput", "导入网易云分享歌曲"],
    ]);
    const tracks = trackRows(resultData(result)).map(mapTrack);
    await rememberTracks(loaded, session, secret, tracks);
    return json(200, { kind: parsed.kind, tracks });
  }

  if (pathName === "/playback/report" && method === "POST") {
    if (session.authenticated) {
      try {
        await consumeQuota();
        await runCapability(loaded, session, secret, [["report", "playback", "--original-id", String(body.externalId || ""), "--event", String(body.event || "progress"), "--position", String(Number(body.positionMs) || 0), "--userInput", "回传播放状态"]]);
      } catch (error) { if (error?.code !== "capability_unavailable") throw error; }
    }
    return json(200, { ok: true });
  }

  throw new GatewayError(404, "not_found", "音乐接口不存在");
}

async function main(event) {
  const cors = corsHeaders(event);
  if (methodOf(event) === "OPTIONS") return { statusCode: 204, headers: cors, body: "" };
  try {
    const response = await route(event);
    response.headers = { ...response.headers, ...cors };
    return response;
  } catch (error) {
    const safe = error instanceof GatewayError || error instanceof CliError || error instanceof IotError ? error : new GatewayError(error?.status || 500, error?.code || "internal_error", "音乐服务暂时不可用");
    return json(safe.status || 500, { code: safe.code || "internal_error", message: safe.message, details: safe.details }, cors);
  }
}

exports.main = main;
exports.route = route;
exports.mapTrack = mapTrack;
exports.mapPlaylist = mapPlaylist;
exports.parseShare = parseShare;
exports.trackRows = trackRows;
exports.playlistRows = playlistRows;
exports.parseAvailableCommands = parseAvailableCommands;
exports.commandPathsFromState = commandPathsFromState;
exports.candidateSupported = candidateSupported;
exports.trustedOptimisticCandidates = trustedOptimisticCandidates;