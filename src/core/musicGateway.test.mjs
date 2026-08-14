import { createRequire } from "node:module";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
const gatewayPath = "../../cloudfunctions/music-gateway/index.js";
const { main, parseShare, route, mapTrack, trackRows, parseAvailableCommands, candidateSupported } = require(gatewayPath);
const { clearWorkspace, shouldPersist } = require("../../cloudfunctions/music-gateway/cli.js");
const { loadSession, validSessionId } = require("../../cloudfunctions/music-gateway/session.js");
const { buildSignedRequest, fetchPaged, iotConfigStatus, mapUpstreamError, mergePlaylists, signingContent } = require("../../cloudfunctions/music-gateway/iot.js");

let fixtureDir;
let fixtureCli;
let fixturePrivateKey;
let fixturePublicKey;

beforeAll(() => {
  const pair = crypto.generateKeyPairSync("rsa", { modulusLength: 2048, publicKeyEncoding: { type: "spki", format: "pem" }, privateKeyEncoding: { type: "pkcs8", format: "pem" } });
  fixturePrivateKey = pair.privateKey;
  fixturePublicKey = pair.publicKey;
  fixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), "chacha-cli-fixture-"));
  fixtureCli = path.join(fixtureDir, "fixture-cli.cjs");
  fs.writeFileSync(fixtureCli, `#!/usr/bin/env node
const fs=require('fs'),path=require('path');
const args=process.argv.slice(2), home=process.env.HOME;
fs.mkdirSync(path.join(home,'.config','ncm-cli'),{recursive:true});
if(args[0]==='config'){fs.writeFileSync(path.join(home,'.config','ncm-cli','credentials.enc.json'),'fixture-credential');console.log('ok');process.exit(0)}
if(args[0]==='login'&&args.includes('--background')){fs.writeFileSync(path.join(home,'.netease_mcp_device.json'),JSON.stringify({deviceId:'fixture',accessToken:'',refreshToken:'',createdAt:0}));console.log(JSON.stringify({success:true,data:{qrCodeUrl:'https://music.163.com/login?fixture=1',uniKey:'fixture-key'}}));process.exit(0)}
if(args[0]==='login'&&args.includes('--check')){
 const commands=[{name:'lyric'},{name:'song',subcommands:[{name:'url'}]},{name:'report',subcommands:[{name:'playback'}]}];
 if(process.env.FIXTURE_DISABLE_PLAYLIST!=='1')commands.unshift({name:'playlist',subcommands:[{name:'list'},{name:'detail'}]});
 if(process.env.FIXTURE_DISABLE_SEARCH!=='1')commands.unshift({name:'search',subcommands:[{name:'song'}]});
 const manifest={commands};
 fs.mkdirSync(path.join(home,'.config','ncm-cli','cache'),{recursive:true});
 fs.writeFileSync(path.join(home,'.netease_mcp_device.json'),JSON.stringify({deviceId:'fixture',accessToken:'access-token',refreshToken:'refresh-token',createdAt:Date.now()}));
 fs.writeFileSync(path.join(home,'.config','ncm-cli','cache','manifest.json'),JSON.stringify(manifest));
 fs.writeFileSync(path.join(home,'.config','ncm-cli','cache','unrelated.json'),'do-not-persist');
 console.log(JSON.stringify({success:true,message:'登录成功',authenticated:true,data:{profile:{userId:'42',nickname:'茶茶',avatarUrl:'https://img.example/avatar.png'}}}));process.exit(0)
}
if(args[0]==='commands'){
 const deviceFile=path.join(home,'.netease_mcp_device.json'),manifestFile=path.join(home,'.config','ncm-cli','cache','manifest.json');
 if(!fs.existsSync(deviceFile)||!JSON.parse(fs.readFileSync(deviceFile,'utf8')).accessToken||!fs.existsSync(manifestFile)){console.error('login required');process.exit(1)}
 console.log(fs.readFileSync(manifestFile,'utf8'));process.exit(0)
}
if(args[0]==='logout'){console.log(JSON.stringify({success:true}));process.exit(0)}
if(args[0]==='search'){console.log(JSON.stringify({success:true,data:{songs:[{id:123,encryptedId:'0123456789abcdef0123456789abcdef',name:'测试歌曲',artists:[{name:'测试歌手'}],album:{name:'测试专辑',picUrl:'https://img.example/cover.jpg'},duration:180000}]}}));process.exit(0)}
if(args[0]==='playlist'&&args[1]==='list'){console.log(JSON.stringify({success:true,data:{playlists:[{id:9,name:'我的歌单',trackCount:1,coverImgUrl:'https://img.example/list.jpg',creator:{nickname:'茶茶'}}]}}));process.exit(0)}
if(args[0]==='playlist'&&args[1]==='detail'){console.log(JSON.stringify({success:true,data:{playlist:{id:9,name:'我的歌单',trackCount:1,tracks:[{id:123,name:'测试歌曲',artists:['测试歌手']}]}}}));process.exit(0)}
if(args[0]==='lyric'){console.log(JSON.stringify({success:true,data:{lrc:{lyric:'[00:00.00]测试歌词'}}}));process.exit(0)}
if(args[0]==='song'&&args[1]==='url'){console.log(JSON.stringify({success:true,data:{url:'https://audio.example/song.mp3',expiresAt:9999999999999}}));process.exit(0)}
if(args[0]==='report'){console.log(JSON.stringify({success:true}));process.exit(0)}
console.error('error: unknown command');process.exit(1);
`, "utf8");
});

afterAll(() => fs.rmSync(fixtureDir, { recursive: true, force: true }));

beforeEach(() => {
  process.env.MUSIC_GATEWAY_MEMORY_STORE = "1";
  process.env.NCM_CLI_BIN = fixtureCli;
  process.env.NETEASE_APP_ID = "fixture-app";
  process.env.NETEASE_PRIVATE_KEY = fixturePrivateKey;
  process.env.MUSIC_SESSION_ENCRYPTION_KEY = "fixture-session-key-with-at-least-32-characters";
  delete process.env.FIXTURE_DISABLE_SEARCH;
  delete process.env.FIXTURE_DISABLE_PLAYLIST;
  for (const name of ["NETEASE_APP_SECRET","NETEASE_IOT_CHANNEL","NETEASE_IOT_DEVICE_TYPE","NETEASE_IOT_OS","NETEASE_IOT_BRAND","NETEASE_IOT_MODEL","NETEASE_IOT_APP_VERSION","NETEASE_IOT_OS_VERSION","NETEASE_IOT_NET_STATUS"]) delete process.env[name];
});

function body(response) { return JSON.parse(response.body); }
function cookie(response) { return String(response.headers["Set-Cookie"] || "").split(";")[0]; }

async function login() {
  const qr = await route({ path: "/api/music/auth/qr", httpMethod: "POST", headers: {} });
  const qrBody = body(qr), sessionCookie = cookie(qr);
  const status = await route({ path: "/api/music/auth/qr/status", httpMethod: "GET", queryStringParameters: { key: qrBody.key }, headers: { cookie: sessionCookie } });
  return { qr, qrBody, status, sessionCookie };
}

describe("music gateway personal CLI mode", () => {
  it("reports CLI mode as configured without exposing credentials", async () => {
    const response = await route({ path: "/api/music/health", httpMethod: "GET", headers: {} });
    expect(body(response)).toMatchObject({ ok: true, configured: true, mode: "official-personal-cli", playlistMode: "official-iot-rest", playlistConfigured: false });
    expect(response.body).not.toContain("PRIVATE KEY");
  });

  it("creates a QR session and authorizes the same cookie", async () => {
    const { qr, qrBody, status } = await login();
    expect(qrBody.qrUrl).toContain("music.163.com/login");
    expect(qrBody.sessionHandle).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    expect(qr.headers["Set-Cookie"]).toMatch(/HttpOnly; Secure; SameSite=None/);
    expect(body(status)).toMatchObject({ status: "authorized", profile: { userId: "42", nickname: "茶茶" } });
  }, 15_000);


  it("uses the opaque bearer session when a browser drops the cross-site cookie", async () => {
    const qr = await route({ path: "/api/music/auth/qr", httpMethod: "POST", headers: {} });
    const qrBody = body(qr), headers = { authorization: `Bearer ${qrBody.sessionHandle}` };
    expect(qrBody.sessionHandle).toMatch(/^[A-Za-z0-9_-]{32,128}$/);
    const status = await route({ path: "/api/music/auth/qr/status", httpMethod: "GET", queryStringParameters: { key: qrBody.key }, headers });
    expect(body(status)).toMatchObject({ status: "authorized", profile: { userId: "42" } });
    const capabilities = await route({ path: "/api/music/capabilities", httpMethod: "GET", headers });
    expect(body(capabilities)).toMatchObject({ authenticated: true, search: true, lyrics: true, stream: true });
    expect(validSessionId("not a session")).toBeUndefined();
    const rejected = await main({ path: "/api/music/auth/qr/status", httpMethod: "GET", queryStringParameters: { key: qrBody.key }, headers: { authorization: "Bearer ../invalid" } });
    expect(rejected.statusCode).toBe(400);
    expect(body(rejected)).toMatchObject({ code: "invalid_qr" });
  }, 15_000);
  it("persists only encrypted login tokens and the dynamic manifest across a cold workspace", async () => {
    const { sessionCookie } = await login();
    const sessionId = sessionCookie.split("=")[1];
    const capabilities = await route({ path: "/api/music/capabilities", httpMethod: "GET", headers: { cookie: sessionCookie } });
    expect(body(capabilities)).toMatchObject({ authenticated: true, search: true, playlists: true, lyrics: true, stream: true });

    const loaded = await loadSession(sessionCookie, process.env.MUSIC_SESSION_ENCRYPTION_KEY);
    const files = loaded.data.cliState.files;
    expect(Object.keys(files).sort()).toEqual([".config/ncm-cli/cache/manifest.json", ".netease_mcp_device.json"]);
    const device = JSON.parse(Buffer.from(files[".netease_mcp_device.json"], "base64").toString("utf8"));
    expect(device).toMatchObject({ accessToken: "access-token", refreshToken: "refresh-token" });
    expect(JSON.stringify(files)).not.toContain("fixture-credential");

    await clearWorkspace(sessionId);
    const restored = await route({ path: "/api/music/capabilities", httpMethod: "GET", queryStringParameters: { refresh: "1" }, headers: { cookie: sessionCookie } });
    expect(body(restored)).toMatchObject({ authenticated: true, search: true, playlists: true, lyrics: true, stream: true });
  }, 15_000);
  it("optimistically runs the official search command when discovery omits it", async () => {
    process.env.FIXTURE_DISABLE_SEARCH = "1";
    const { sessionCookie } = await login();
    const before = await route({ path: "/api/music/capabilities", httpMethod: "GET", headers: { cookie: sessionCookie } });
    expect(body(before)).toMatchObject({ authenticated: true, search: false, playlists: true });
    const search = await route({ path: "/api/music/search", httpMethod: "GET", queryStringParameters: { q: "晴天" }, headers: { cookie: sessionCookie } });
    expect(body(search).tracks[0]).toMatchObject({ externalId: "123", title: "测试歌曲" });
    const after = await route({ path: "/api/music/capabilities", httpMethod: "GET", headers: { cookie: sessionCookie } });
    expect(body(after)).toMatchObject({ authenticated: true, search: true });
  }, 15_000);

it("parses nested command manifests and rejects credential/cache persistence", () => {
    const paths = parseAvailableCommands({ json: { commands: { search: { subcommands: { song: {} } }, playlist: { subcommands: [{ name: "list" }] } } } });
    expect(candidateSupported(paths, ["search", "song", "--keyword", "测试"])).toBe(true);
    expect(candidateSupported(paths, ["playlist", "list"])).toBe(true);
    expect(candidateSupported(new Set(["search"]), ["search", "song", "--keyword", "测试"])).toBe(false);
    expect(candidateSupported(new Set(["search", "song"]), ["search", "song", "--keyword", "测试"])).toBe(true);
    expect(candidateSupported(new Set(["playlist", "list"]), ["playlist", "list"])).toBe(true);
    expect(candidateSupported(new Set(["playlist"]), ["playlist", "list"])).toBe(false);
    expect(candidateSupported(new Set(["song"]), ["song", "url"])).toBe(false);
    expect(shouldPersist(".netease_mcp_device.json")).toBe(true);
    expect(shouldPersist(".config/ncm-cli/cache/manifest.json")).toBe(true);
    expect(shouldPersist(".config/ncm-cli/credentials.enc.json")).toBe(false);
    expect(shouldPersist(".config/ncm-cli/cache/unrelated.json")).toBe(false);
  });
  it("keeps search and playlist response shapes compatible", async () => {
    const { sessionCookie } = await login();
    const search = await route({ path: "/api/music/search", httpMethod: "GET", queryStringParameters: { q: "测试" }, headers: { cookie: sessionCookie } });
    expect(body(search).tracks[0]).toMatchObject({ id: "netease:123", externalId: "123", title: "测试歌曲", artists: ["测试歌手"] });
    const playlists = await route({ path: "/api/music/me/playlists", httpMethod: "GET", headers: { cookie: sessionCookie } });
    expect(body(playlists).playlists[0]).toMatchObject({ id: "netease-playlist:9", name: "我的歌单" });
    const detail = await route({ path: "/api/music/playlists/9", httpMethod: "GET", headers: { cookie: sessionCookie } });
    expect(body(detail)).toMatchObject({ playlist: { externalId: "9", trackIds: ["netease:123"] } });
  }, 15_000);

  it("only imports playlists returned by the current account", async () => {
    const { sessionCookie } = await login();
    const beforeList = await main({ path: "/api/music/playlists/9", httpMethod: "GET", headers: { cookie: sessionCookie } });
    expect(beforeList.statusCode).toBe(403);
    expect(body(beforeList)).toMatchObject({ code: "playlist_not_owned" });

    await route({ path: "/api/music/me/playlists", httpMethod: "GET", headers: { cookie: sessionCookie } });
    const owned = await route({ path: "/api/music/playlists/9", httpMethod: "GET", headers: { cookie: sessionCookie } });
    expect(body(owned)).toMatchObject({ playlist: { externalId: "9" } });

    const shared = await main({
      path: "/api/music/resolve",
      httpMethod: "POST",
      headers: { cookie: sessionCookie },
      body: JSON.stringify({ url: "https://music.163.com/playlist?id=9" }),
    });
    expect(shared.statusCode).toBe(400);
    expect(body(shared)).toMatchObject({ code: "playlist_link_unsupported" });
    expect(body(shared).message).toContain("我的网易云歌单");
  }, 15_000);
  it("returns lyrics and legal browser stream data from CLI output", async () => {
    const { sessionCookie } = await login();
    const lyrics = await route({ path: "/api/music/tracks/123/lyrics", httpMethod: "GET", headers: { cookie: sessionCookie } });
    expect(body(lyrics).lrc).toContain("测试歌词");
    const stream = await route({ path: "/api/music/tracks/123/stream", httpMethod: "GET", headers: { cookie: sessionCookie } });
    expect(body(stream).url).toBe("https://audio.example/song.mp3");
  }, 15_000);

  it("parses official links and normalizes official dual song IDs", () => {
    expect(parseShare("https://music.163.com/song?id=123")).toEqual({ kind: "track", id: "123" });
    expect(() => parseShare("https://example.com/song?id=123")).toThrow();
    const rows = trackRows({ nested: { songs: [{ originalId: 7, encryptedId: "abc", title: "歌" }] } });
    expect(mapTrack(rows[0])).toMatchObject({ externalId: "7", encryptedId: "abc", originalId: "7" });
  });
});
function configureIot() {
  process.env.NETEASE_APP_SECRET = "fixture-app-secret";
  process.env.NETEASE_IOT_CHANNEL = "assigned-channel";
  process.env.NETEASE_IOT_DEVICE_TYPE = "assigned-device-type";
  process.env.NETEASE_IOT_OS = "assigned-os";
  process.env.NETEASE_IOT_BRAND = "assigned-brand";
  process.env.NETEASE_IOT_MODEL = "chacha-web";
  process.env.NETEASE_IOT_APP_VERSION = "1.0.0";
  process.env.NETEASE_IOT_OS_VERSION = "1.0";
  process.env.NETEASE_IOT_NET_STATUS = "wifi";
}

function fakeResponse(payload, status = 200) {
  return { ok: status >= 200 && status < 300, status, text: async () => JSON.stringify(payload) };
}

function verifySignedForm(formBody) {
  const params = Object.fromEntries(new URLSearchParams(formBody));
  const sign = params.sign;
  delete params.sign;
  expect(crypto.verify("RSA-SHA256", Buffer.from(signingContent(params), "utf8"), fixturePublicKey, Buffer.from(sign, "base64"))).toBe(true);
  return params;
}

describe("music gateway official IOT playlist adapter", () => {
  it("keeps the adapter disabled until every assigned IOT parameter exists", () => {
    expect(iotConfigStatus()).toMatchObject({ configured: false });
    configureIot();
    expect(iotConfigStatus()).toMatchObject({ configured: true, missing: [], invalid: [] });
    process.env.NETEASE_IOT_APP_VERSION = "1.0";
    expect(iotConfigStatus()).toMatchObject({ configured: false, invalid: ["NETEASE_IOT_APP_VERSION"] });
  });

  it("builds a stable RSA-SHA256 signed POST form without putting secrets in a URL", () => {
    configureIot();
    const config = iotConfigStatus().config;
    const built = buildSignedRequest({
      config,
      accessToken: "fixture-access-token",
      device: { channel: "assigned-channel", deviceId: "device123", deviceType: "assigned-device-type", appVer: "1.0.0", os: "assigned-os", osVer: "1.0", brand: "assigned-brand", model: "chacha-web", clientIp: "203.0.113.5", netStatus: "wifi" },
      bizContent: { limit: 500, offset: 0 },
      timestamp: 1786291200000,
    });
    const params = verifySignedForm(built.body);
    expect(params).toMatchObject({ appId: "fixture-app", appSecret: "fixture-app-secret", accessToken: "fixture-access-token", signType: "RSA_SHA256", timestamp: "1786291200000" });
    expect(JSON.parse(params.bizContent)).toEqual({ limit: 500, offset: 0 });
    expect(built.content).toBe(signingContent(params));
  });

  it("paginates official results and merges created, liked and subscribed playlists without duplicates", async () => {
    configureIot();
    const session = { cliState: { files: { ".netease_mcp_device.json": Buffer.from(JSON.stringify({ deviceId: "device123", accessToken: "access-token" })).toString("base64") } } };
    const calls = [];
    const fetchImpl = async (url, init) => {
      const params = verifySignedForm(init.body);
      const biz = JSON.parse(params.bizContent);
      calls.push({ url, biz });
      const rows = biz.offset === 0
        ? Array.from({ length: 500 }, (_, index) => ({ id: `p${index}`, name: `歌单${index}`, trackCount: 0 }))
        : [{ id: "p500", name: "歌单500", trackCount: 0 }];
      return fakeResponse({ code: 200, data: { recordCount: 501, records: rows } });
    };
    const rows = await fetchPaged("/openapi/music/basic/playlist/created/get/v2", {}, { session, sessionId: "session", event: { headers: { "x-forwarded-for": "203.0.113.5" } }, fetchImpl, timestamp: 1786291200000 });
    expect(rows).toHaveLength(501);
    expect(calls.map(call => call.biz.offset)).toEqual([0, 500]);
    expect(mergePlaylists([{ id: "heart", name: "我喜欢的音乐" }, { id: "same", name: "我的版本" }], [{ id: "same", name: "收藏版本" }, { id: "other", name: "收藏歌单" }])).toEqual([
      expect.objectContaining({ id: "heart", accountRelation: "created" }),
      expect.objectContaining({ id: "same", name: "我的版本", accountRelation: "created" }),
      expect.objectContaining({ id: "other", accountRelation: "subscribed" }),
    ]);
  });

  it("uses IOT REST for account playlists while preserving the existing frontend response shape", async () => {
    configureIot();
    process.env.FIXTURE_DISABLE_PLAYLIST = "1";
    const { sessionCookie } = await login();
    const requests = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      const params = verifySignedForm(init.body);
      const biz = JSON.parse(params.bizContent);
      requests.push({ url: String(url), params, biz });
      if (String(url).endsWith("/playlist/created/get/v2")) return fakeResponse({ code: 200, data: { recordCount: 2, records: [
        { id: "heart", name: "我喜欢的音乐", specialType: 5, trackCount: 1, coverImgUrl: "https://img.example/heart.jpg", creatorNickName: "茶茶" },
        { id: "shared", name: "我创建的歌单", trackCount: 0, creatorNickName: "茶茶" },
      ] } });
      if (String(url).endsWith("/playlist/subed/get/v2")) return fakeResponse({ code: 200, data: { recordCount: 2, records: [
        { id: "shared", name: "重复收藏项", trackCount: 0 },
        { id: "saved", name: "我收藏的歌单", trackCount: 1, creatorNickName: "朋友" },
      ] } });
      if (String(url).endsWith("/playlist/song/list/get/v3")) return fakeResponse({ code: 200, data: [
        { id: "song1", name: "可播放歌曲", duration: 180000, artists: [{ name: "歌手" }], album: { name: "专辑" }, playFlag: true },
        { id: "song2", name: "受限歌曲", duration: 200000, artists: [{ name: "歌手" }], playFlag: false },
      ] });
      return fakeResponse({ code: 404, message: "not found" }, 404);
    };
    try {
      const headers = { cookie: sessionCookie, "x-forwarded-for": "203.0.113.9" };
      const capabilities = await route({ path: "/api/music/capabilities", httpMethod: "GET", headers });
      expect(body(capabilities)).toMatchObject({ authenticated: true, playlists: true });
      const list = await route({ path: "/api/music/me/playlists", httpMethod: "GET", headers });
      expect(body(list).playlists.map(item => item.externalId)).toEqual(["heart", "shared", "saved"]);
      expect(body(list).playlists[2]).toMatchObject({ name: "我收藏的歌单", ownerName: "朋友" });
      const detail = await route({ path: "/api/music/playlists/heart", httpMethod: "GET", headers });
      expect(body(detail)).toMatchObject({ playlist: { externalId: "heart", name: "我喜欢的音乐", trackIds: ["netease:song1", "netease:song2"] } });
      expect(body(detail).tracks[1].unavailableReason).toContain("限制");
      const rejected = await main({ path: "/api/music/playlists/not-owned", httpMethod: "GET", headers });
      expect(rejected.statusCode).toBe(403);
      expect(body(rejected)).toMatchObject({ code: "playlist_not_owned" });
      expect(requests.every(request => !request.url.includes("fixture-app-secret") && !request.url.includes("access-token"))).toBe(true);
      expect(requests).toHaveLength(3);
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, 20_000);

  it("persists an official permission denial and disables playlist capability for the current session", async () => {
    configureIot();
    process.env.FIXTURE_DISABLE_PLAYLIST = "1";
    const { sessionCookie } = await login();
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => fakeResponse({ code: 403, message: "当前应用无权限调用该接口" }, 403);
    try {
      const headers = { cookie: sessionCookie, "x-forwarded-for": "203.0.113.12" };
      const list = await main({ path: "/api/music/me/playlists", httpMethod: "GET", headers });
      expect(list.statusCode).toBe(403);
      expect(body(list)).toMatchObject({ code: "playlist_permission_denied", message: "当前网易云应用没有账号歌单读取权限" });
      const capabilities = await route({ path: "/api/music/capabilities", httpMethod: "GET", headers });
      expect(body(capabilities)).toMatchObject({ authenticated: true, playlists: false, reasons: { playlists: "当前网易云应用没有账号歌单读取权限" } });
    } finally {
      globalThis.fetch = originalFetch;
    }
  }, 20_000);

  it("maps official login, permission, resource and quota failures to stable safe errors", () => {
    expect(mapUpstreamError({ code: 1406, message: "accessToken过期，请重新授权登录" }, 200)).toMatchObject({ status: 401, code: "login_required" });
    expect(mapUpstreamError({ code: 403, message: "当前应用无权限" }, 403)).toMatchObject({ status: 403, code: "playlist_permission_denied" });
    expect(mapUpstreamError({ code: 10007, message: "资源不存在" }, 200)).toMatchObject({ status: 404, code: "resource_not_found" });
    expect(mapUpstreamError({ code: 429, message: "请求频率超过额度" }, 429)).toMatchObject({ status: 429, code: "quota_exceeded" });
  });
});
