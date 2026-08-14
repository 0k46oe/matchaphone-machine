# 茶茶机网易云音乐网关

这是 CloudBase HTTP 云函数。二维码登录、登录状态和 CLI 能力继续使用网易云音乐个人开发者官方 `@music163/ncm-cli`；账号歌单导入使用网易云官方 IOT REST API。仓库不包含任何真实凭证。

## CloudBase 基础配置

1. 创建文档数据库集合 `music_sessions` 和 `music_api_quota`，权限设为仅云函数/管理端可读写。
2. 在 `music-gateway` 的函数配置中填写：
   - `NETEASE_APP_ID`
   - `NETEASE_PRIVATE_KEY`
   - `MUSIC_SESSION_ENCRYPTION_KEY`（至少 24 字符，建议 32 字节随机 Base64）
   - `MUSIC_ALLOWED_ORIGINS`（可选）
3. 部署并访问 `/api/music/health`，CLI 配置成功时返回 `configured:true` 和 `mode:official-personal-cli`。

## 官方 IOT 歌单配置

账号创建、红心和收藏歌单依赖以下服务端环境变量：

- `NETEASE_APP_SECRET`
- `NETEASE_IOT_CHANNEL`
- `NETEASE_IOT_DEVICE_TYPE`
- `NETEASE_IOT_OS`
- `NETEASE_IOT_BRAND`
- `NETEASE_IOT_MODEL`
- `NETEASE_IOT_APP_VERSION`（必须为 `x.x.x`）
- `NETEASE_IOT_OS_VERSION`
- `NETEASE_IOT_NET_STATUS`（`wifi`、`2g`、`3g`、`4g` 或 `5g`）

`channel`、`deviceType`、`os` 和 `brand` 等字段必须使用网易云正式分配或确认的值，不能复制文档示例。配置不完整时 `/health` 会返回 `playlistConfigured:false` 和缺失变量名，CLI 登录、本地文件与直链音乐仍可使用。

歌单适配器只读取当前登录账号通过以下官方接口返回的歌单：

- `/openapi/music/basic/playlist/created/get/v2`
- `/openapi/music/basic/playlist/subed/get/v2`
- `/openapi/music/basic/playlist/song/list/get/v3`

## 安全与兼容

- CLI 和 IOT 请求均不使用 Shell 字符串拼接。
- IOT 请求固定发送到 `https://openapi.music.163.com`，使用 POST 表单和 RSA-SHA256 签名。
- AppSecret、Private Key、AccessToken、签名和完整上游请求不会进入前端、错误响应或业务日志。
- App ID、AppSecret 和 Private Key 每次从函数环境变量读取；会话令牌使用 AES-GCM 加密存入 `music_sessions`。
- 仅加密保存 `.netease_mcp_device.json` 中的登录令牌和 `.config/ncm-cli/cache/manifest.json` 动态命令清单；凭证文件、日志、PID 和其他缓存不会写入会话数据库。
- IOT 歌单 ID 必须先由当前账号的创建/收藏列表返回，不能通过猜测 ID 或分享链接导入任意歌单。
- 不开放的官方能力返回稳定错误，不回退到非官方网易云 API。
- `vendor/ffprobe-static` 是未使用云盘上传能力的轻量占位包，用于避免把多平台 ffprobe 二进制打进云函数。
