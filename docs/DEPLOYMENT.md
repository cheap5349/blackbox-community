# 部署与运维

## 上线前必做清单

按顺序核对，每一条都对应一个真实故障点：

- [ ] `JWT_SECRET` 换成强随机值（`openssl rand -hex 32`）。`docker-compose.yml` 的兜底值是 `please-change-me`，**不改等于把签名密钥公开在仓库里**。
- [ ] MySQL 密码不再是 `rootpass`，且不使用 root 账号对外提供服务。
- [ ] `CORS_ORIGINS` 改为真实前端域名，删掉 localhost。
- [ ] `NODE_ENV=production`（触发弱密钥拒绝启动的保护）。
- [ ] `S3_PUBLIC_URL` 改为浏览器可达的域名/CDN，**不是**容器内网地址。
- [ ] 前置 HTTPS 反向代理，并确认 `X-Forwarded-For` 正确透传（否则限流会把所有用户算作同一个 IP）。
- [ ] `GET /api/health` 返回 `{ ok: true }`。
- [ ] 已按 [BACKUP-RESTORE.md](BACKUP-RESTORE.md) 做一次真实恢复演练。

## 方式 A：Docker Compose（推荐）

```bash
# 在项目根目录创建 .env，至少覆盖敏感项
cat >> .env <<'EOF'
MYSQL_ROOT_PASSWORD=<强密码>
JWT_SECRET=<openssl rand -hex 32>
CORS_ORIGINS=https://your-domain.com
S3_BUCKET=heibox
EOF

docker compose up -d --build
docker compose ps            # 三个服务都应为 healthy / running
curl http://127.0.0.1:3000/api/health
```

Compose 编排了三个服务：`mysql:8`、`minio/minio`（S3 API 9000 / 控制台 9001）、`api`（多阶段 Dockerfile 构建：`npm ci` → `vite build` → `npm prune --omit=dev`，运行阶段只带 `server/`、`dist/`、`public/`）。

`api` 通过 `depends_on: condition: service_healthy` 等待 MySQL 与 MinIO 的 healthcheck 通过，因此首次启动不会因数据库未就绪而崩。

> 前端静态资源（`public/` 下的图标、`public/audio/` 下的音频等）会由 `vite build` 复制进 `dist/`，随镜像分发。因此**更新音频后需要重新构建镜像，或在容器内替换 `dist/audio/` 下的文件**；直接改容器里已有的 `dist/` 内容会在下次部署时被新镜像覆盖。

**首次启动后**：`server/index.js` 会自动执行幂等种子数据；建表需要 schema：

```bash
docker compose exec -T mysql mysql -uroot -p"$MYSQL_ROOT_PASSWORD" heibox < server/schema.sql
```

（`docker compose up` 只创建空库，`schema.sql` 需手动套用一次；测试环境由 `server/test/helpers.js` 自动完成这一步。）

数据卷：`mysql_data`（数据库）、`minio_data`（对象存储）、`uploads_data`（本地兜底模式的媒体目录）。

## 方式 B：PM2 + Nginx（裸机）

```bash
npm ci
npm run build
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup            # 生成开机自启命令并按提示执行
```

`ecosystem.config.cjs` 以 fork 模式单实例运行 `server/index.js`，`max_memory_restart: 300M`，日志写到 `logs/out.log` 与 `logs/err.log`。

> 单实例是当前限流实现的前提：限流计数在进程内存里（`server/security.js:24-45`）。要跑多实例，必须先把限流换成 Redis 或网关层限流，否则每个副本各自计数、实际阈值被放大 N 倍。

### Nginx 反向代理

```nginx
server {
  listen 443 ssl http2;
  server_name your-domain.com;

  ssl_certificate     /etc/letsencrypt/live/your-domain.com/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;

  # 必须 ≥ 单文件上限（50 MB），否则大视频上传会在代理层被截断
  client_max_body_size 60m;

  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host              $host;
    proxy_set_header X-Real-IP         $remote_addr;
    proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}

server {
  listen 80;
  server_name your-domain.com;
  return 301 https://$host$request_uri;
}
```

前端由 Express 直接托管 `dist/`（含 SPA fallback），无需再单独配置静态站点；只需确保 `/api`、`/uploads`、`/videos` 与页面路由都转到同一个 3000 端口。

## 方式 C：GitHub Pages 静态演示（只给人看效果）

GitHub Pages 只能托管静态文件，本项目后端是 Express + MySQL，所以这条路径发布的是**演示版**：界面（开场动画、主题背景、图标、性能徽标、唱片机）完整，数据来自 `src/demo.js` 内置的示例帖，写入操作返回一句可读提示。线上地址：https://cheap5349.github.io/blackbox-community/

工作流 `.github/workflows/pages.yml` 已经写好，`main` 分支一推送就自动构建并发布；首次需要手动开启一次 Pages：

```bash
gh api --method POST repos/<owner>/<repo>/pages -f build_type=workflow
```

要点：

- `VITE_DEMO=1` 打开演示模式（`src/api.js` 把请求交给 `demoApi`，不再打 `/api`）。
- `VITE_BASE_PATH=/<仓库名>/` 决定 `vite.config.js` 的 `base`；`src/router.js` 用 `import.meta.env.BASE_URL` 建 history，否则站内跳转会掉到域名根目录。
- 发布前 `cp dist/index.html dist/404.html`：Pages 对未知路径返回 `404.html`，深链接才能落到 SPA 外壳（HTTP 状态码仍是 404，浏览器里正常渲染）。
- `touch dist/.nojekyll`：避免 Jekyll 处理 `assets/` 下的文件。
- 演示版里的音频走 `/<仓库名>/audio/…`；`public/audio/bgm.mp3` 因版权原因未入库，线上听不到音乐属预期。

## 健康检查与监控

- 存活：`GET /api/health` → `{ ok: true }`，不查数据库，适合做容器 liveness。
- 业务可用性：`GET /api/posts?limit=1` 返回 200 才算真正可用（503 表示数据库断了）。
- 日志：容器模式 `docker compose logs -f api`；PM2 模式 `pm2 logs heibox-api`。服务端只把异常打印到 stderr，不写业务日志文件。

## 升级流程

```bash
git pull                     # 或替换代码目录
npm ci                       # 依赖有变更时必跑
npm run build                # 重新构建 dist
docker compose up -d --build # 或 pm2 reload heibox-api
curl -f http://127.0.0.1:3000/api/health
```

数据库结构变更需在升级前单独执行迁移 SQL；当前没有迁移框架，`server/schema.sql` 用 `CREATE TABLE IF NOT EXISTS` 语义时不影响已有数据，但**不会**自动添加新列。

回滚：保留上一个版本的 `dist/` 与镜像 tag，出问题直接切回；数据库变更需提前准备逆向 SQL。

## 排障对照

| 现象 | 排查方向 |
| --- | --- |
| `api` 容器反复重启 | `docker compose logs api`；多为数据库凭据错误或 `JWT_SECRET` 未设置 |
| 502 Bad Gateway | 反代指向的端口不对，或 Node 进程已退出 |
| 页面能开、接口全 404 | Nginx 未把 `/api` 转到 3000 |
| 上传大文件 413 | Nginx `client_max_body_size` 小于文件大小 |
| 图片 404（帖子文本正常） | `S3_PUBLIC_URL` 指向了容器内网地址 |
| 限流误伤所有用户 | 未透传 `X-Forwarded-For`，所有请求被算作代理 IP |
| 登录后立刻失效 | 多实例各自 `JWT_SECRET` 不一致 |
