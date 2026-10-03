# 环境配置

所有配置通过根目录 `.env` 注入（`dotenv`）。从模板开始：

```bash
cp .env.example .env
```

`.env` 含密钥，**不要提交到版本库**。

## 变量清单

### 服务

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `PORT` | `3000` | API 与静态托管的监听端口 |
| `NODE_ENV` | `development` | 设为 `production` 会启用更严格的启动校验（见下） |
| `VIDEOS_DIR` | `public/videos` | 个人卡片背景视频目录；`GET /api/videos` 会列出其中媒体文件 |

### 安全

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `JWT_SECRET` | 无 | 签发 token 的密钥，**生产必须设置** |
| `CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | 逗号分隔的跨域白名单 |
| `RATE_LIMIT_DISABLED` | 未设置 | 仅测试用逃生口，设为 `1` 关闭限流；生产勿设 |

`JWT_SECRET` 的启动行为（`server/config.js:9-16`）：

- 未设置且 `NODE_ENV=production` → **抛错拒绝启动**（`JWT_SECRET 未配置：生产环境禁止启动`）。
- 未设置且非生产 → 使用内置 `dev-secret` 并打印告警。
- 设置为 `dev-secret` 或 `change-this-secret` 且为生产 → **抛错拒绝启动**。
- token 有效期 7 天，登录响应里同时返回 `expires_at`（epoch 秒），前端据此判断登录态过期。

生成强随机密钥：

```bash
openssl rand -hex 32
```

### 数据库（MySQL）

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `DB_HOST` | `127.0.0.1` | `docker compose` 部署时为服务名 `mysql` |
| `DB_PORT` | `3306` | |
| `DB_USER` | `root` | 建议生产另建最小权限账号 |
| `DB_PASSWORD` | 空 | |
| `DB_NAME` | `blackbox`（`db.js`）/ `heibox`（`.env.example` 与 `schema.sql`） | 实际使用 `heibox` |

`DB_HOST`、`DB_USER`、`DB_NAME` 缺失时 `server/db.js:8` 会打印「未读取到完整数据库配置，请在项目根目录创建 .env」——服务仍会启动，但请求会返回 503 并提示检查 MySQL 配置。

初始化数据库：

```bash
mysql -u root -p < server/schema.sql   # 建库 heibox + 7 张表（users / communities / posts / comments / likes / reports / notifications）
npm run server                          # 启动后自动执行幂等种子数据
```

### 对象存储（可选）

四项（`S3_ENDPOINT`、`S3_ACCESS_KEY`、`S3_SECRET_KEY`、`S3_BUCKET`）**任一缺失即整体回退本地磁盘**，媒体写入 `server/uploads` 并由 Express 静态托管。本地开发与自动化测试不需要任何外部服务。

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `S3_ENDPOINT` | 空 | S3 兼容端点，如 `http://minio:9000` |
| `S3_ACCESS_KEY` | 空 | |
| `S3_SECRET_KEY` | 空 | |
| `S3_BUCKET` | 空 | 桶名，需已存在 |
| `S3_REGION` | `us-east-1` | 云厂商按实际填写 |
| `S3_PUBLIC_URL` | 空 | 浏览器可直连的地址。MinIO path-style 需带桶名（`http://localhost:9000/heibox`），云厂商通常为虚拟主机域名 |
| `S3_FORCE_PATH_STYLE` | `true` | MinIO 保持 `true`；云厂商虚拟主机模式设 `false` |

生产环境最常见的一处配置错误：`S3_ENDPOINT` 写成了容器内地址（`http://minio:9000`），而 `S3_PUBLIC_URL` 忘记改成浏览器可达的域名，表现为帖子里的图片全部 404。

## 按场景的最小配置

**纯本地开发**（前端 Vite dev server + 本地 MySQL）：

```dotenv
PORT=3000
JWT_SECRET=dev-secret
DB_HOST=127.0.0.1
DB_USER=root
DB_PASSWORD=你的本地密码
DB_NAME=heibox
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

**生产（Docker Compose）**：`docker-compose.yml` 已写好服务内网配置，只需在外部覆盖敏感项：

```dotenv
MYSQL_ROOT_PASSWORD=<强密码>
JWT_SECRET=<openssl rand -hex 32>
CORS_ORIGINS=https://your-domain.com
S3_BUCKET=heibox
```

`docker-compose.yml:47` 的 `JWT_SECRET` 兜底值是 `please-change-me`，**上线前必须覆盖**，否则等于把 token 签名密钥写在仓库里。

## 排障对照

| 现象 | 原因 |
| --- | --- |
| 启动即抛 `JWT_SECRET 未配置：生产环境禁止启动` | 生产环境未设置 `JWT_SECRET`，属预期保护 |
| 接口返回 503「数据库未连接，请检查 .env 和 MySQL」 | MySQL 未启动、库未建或凭据错误 |
| 浏览器报 CORS 错误 | 前端来源不在 `CORS_ORIGINS` 白名单内 |
| 前端能开但接口 404 | 反向代理未转发 `/api`，见 [DEPLOYMENT.md](DEPLOYMENT.md) |
| 上传大图返回 413 | 单文件超过 50 MB 或 JSON 体超过 6 MB |
| 测试跑几十个账号后被限流 | 测试需设 `RATE_LIMIT_DISABLED=1`（`server/test/helpers.js:37` 已自动设置） |
