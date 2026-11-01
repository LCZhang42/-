# A6 角色分享服务

这是一个可选的 Cloudflare Worker API。它使用 D1 保存元数据与举报，使用 R2 保存重编码后的 PNG/WebP。前端没有配置 API 地址时，A5 本地角色功能照常工作。

生产部署要求：

- Worker 绑定 `DB`（D1）和 `BUCKET`（R2）。
- 可复制 `wrangler.example.toml` 作为独立 Cloudflare Worker 的起点；Sites 托管时改用 `.openai/hosting.json` 的 `d1`／`r2` 绑定。
- 应用 `migrations/0001_character_shares.sql`。
- 设置 `SHARE_ORIGIN`、`IP_HASH_SALT` 和 `MODERATOR_TOKEN`，不要把真实值提交到仓库。
- 默认要求 Sites 提供的 `oai-authenticated-user-id`；只有明确接受匿名上传风险时才设置 `ALLOW_ANONYMOUS_UPLOADS=true`。
- 前端把服务地址写入 `GAME_CONFIG.shareApiBase`，或在游戏的“在线分享”面板中本地保存调试地址。

安全边界：未公开代码不是公开角色广场；服务端检查格式、文件魔数、2 MB 上限、每日 5 次/8 MB 配额。每个访问者对同一分享只计一次举报，三次举报自动隔离。上传者可用登录身份或仅存于本机的删除令牌删除云端副本。
