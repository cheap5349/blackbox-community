# API 参考

所有接口挂在 `/api` 下，请求与响应均为 JSON（头像与发帖含媒体的接口除外，见下）。

## 通用约定

**鉴权**：需要登录的接口在请求头带 token：

```
Authorization: Bearer <token>
```

token 由注册/登录返回，有效期 7 天，响应中同时给出 `expires_at`（epoch 秒）。

**错误格式**：统一为 `{ "message": "可直接展示给用户的中文说明" }`，个别接口额外带机器可读字段（如 `blocked`、`code`）。

**状态码**：

| 码 | 含义 |
| --- | --- |
| 200 | 成功（创建类接口同样返回 200，不返回 201） |
| 400 | 参数校验失败、内容被敏感词拦截、重复举报等 |
| 401 | 未登录或 token 无效/过期 |
| 403 | 已登录但无权限（非作者、非管理员、账号被封禁/禁言） |
| 404 | 资源不存在 |
| 413 | 上传体积超限（单文件 50 MB / JSON 体 6 MB） |
| 429 | 触发限流 |
| 503 | 数据库不可用 |

**限流**：`/api` 全局 300 次 / 15 分钟 / IP；`/api/auth` 另有 10 次 / 15 分钟 / IP 的更严限制。

**封禁语义**：`userState` 中间件每次请求回查用户状态。被 `banned` 的账号访问需登录接口返回 403 且带 `code: "ACCOUNT_BANNED"`；被禁言的账号可读可赞但发帖/评论/编辑返回 403。

**匿名（树洞）**：社区名恰为「讨论区」时，服务端把返回数据里的作者统一替换为「匿名」且头像置空，前端无需处理。

**分页**：统一用 `limit`（默认 10，上限 50）与 `offset`（默认 0），列表响应一般同时返回 `total`。

## 认证 `/api/auth`

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| POST | `/register` | — | `{ name, email, password }`；密码至少 6 位；邮箱重复返回 400「邮箱已注册」；成功返回 session |
| POST | `/login` | — | `{ email, password }`；封禁账号返回 403 + `code: "ACCOUNT_BANNED"` |
| GET | `/me` | 是 | 返回当前用户资料（含 `role`） |
| PUT | `/me` | 是 | 改资料：`{ name?, bio?, avatar? }`；改密码需 `{ oldPassword, newPassword }`（新密码至少 6 位）；返回新的 session |
| POST | `/avatar` | 是 | `multipart/form-data`，字段名 `avatar`，单图上限 5 MB；返回 `{ avatar: url }` |

session 结构：`{ token, user, expires_at }`。

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"测甲","email":"a@t.com","password":"123456"}'
```

## 帖子 `/api/posts`

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/` | 可选 | 列表，见下方参数表，返回 `{ posts, total }` |
| GET | `/:id` | 可选 | 单帖详情，含 `like_count`、`comment_count`、`liked`、`reported` |
| POST | `/` | 是 | 发帖（`multipart/form-data`），字段 `title`、`content`、`communityId`、`images[]`、`video`；返回新建帖子 |
| PUT | `/:id` | 是（作者或管理员） | 编辑：`title`、`content`、`communityId`；改社区会同步更新 |
| DELETE | `/:id` | 是（作者或管理员） | 删除帖子并清理其媒体文件 |
| POST | `/:id/like` | 是 | 点赞；返回 `{ ok, liked: true, likeCount }` |
| DELETE | `/:id/like` | 是 | 取消点赞；返回 `{ ok, liked: false, likeCount }` |
| POST | `/:id/report` | 是 | 举报：`{ reason }`（最长 200 字）；不能举报自己；同一帖重复举报返回 400 |
| GET | `/:id/comments` | 可选 | 评论列表，返回 `{ comments, total }` |
| POST | `/:id/comments` | 是 | 发评论：`{ content }`（最长 500 字）；返回 `{ comment, total, masked }` |
| DELETE | `/comments/:id` | 是（作者或管理员） | 删除评论，返回 `{ ok, total }` |

列表查询参数：

| 参数 | 默认 | 说明 |
| --- | --- | --- |
| `limit` | 10 | 上限 50 |
| `offset` | 0 | |
| `sort` | `latest` | `latest`（置顶优先 + 时间倒序）、`hot`（点赞 + 2×评论做时间衰减）、`featured`（置顶 + 加精优先）；非法值回退 `latest` |
| `communityId` | — | 按社区筛选 |
| `userId` | — | 按作者筛选 |
| `q` | — | 关键词，匹配帖子标题/正文、作者名、社区名 |
| `featured` | — | 传 `1` 只看加精帖 |

所有排序模式都把 `pinned` 置顶帖排在最前。

## 社区 `/api/communities`

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/` | — | 社区列表（含帖子数等聚合） |
| GET | `/:id` | — | 单个社区 |
| GET | `/:id/posts` | 可选 | 该社区的帖子 |
| POST | `/` | 是 | 建社区：`{ name, description }`；名称最长 80 字符 |
| PUT | `/:id` | 是（创建者） | 改名/改简介 |
| DELETE | `/:id` | 是（创建者） | 删除，返回 `{ ok, message }` |

## 站内通知 `/api/notifications`

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/unread` | 是 | 未读数，返回 `{ unread }`；前端每 60 秒轮询一次 |
| GET | `/` | 是 | 列表，支持 `limit`/`offset`，返回 `{ notifications, total, unread }` |
| POST | `/read` | 是 | 标记已读：传 `{ id }` 标单条，不传则全部标记；返回 `{ ok, unread }` |

列表项包含两个服务端兜底字段：`post_deleted`（帖子已被删除，前端显示「内容已删除」而不是死链）与 `actor_name`（发起人已注销时退回快照名或「有人」）。

## 管理后台 `/api/admin`

整个模块在路由级挂了 `auth + userState + adminOnly`，非 `role === 'admin'` 一律 403。`userState` 先回查数据库再判权，因此被降权的管理员会立即失效，旧 token 无法继续操作。

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/stats` | 汇总 `{ posts, communities, users, reports, banned, muted }` |
| GET | `/posts` | 帖子管理列表（支持分页与筛选），返回 `{ posts, total }` |
| GET | `/communities` | 社区管理列表，返回 `{ communities, total }` |
| GET | `/users` | 用户列表，返回 `{ users, total }` |
| POST | `/users/:id/state` | 用户治理，见下，返回 `{ ok, message, user }` |
| POST | `/posts/:id/flags` | 设置 `{ pinned?, featured? }` 标记，返回 `{ ok, post }` |
| GET | `/users/:id/posts` | 某用户的帖子（含 `is_treehole` 标记） |
| GET | `/users/:id/comments` | 某用户的评论，返回 `{ comments }` |
| GET | `/reports` | 举报列表，返回 `{ reports, total }` |
| POST | `/reports/:id/resolve` | 处理举报：`{ action: "dismiss" \| "delete" }`；已处理的举报返回 400 |

`POST /users/:id/state` 的 `action` 取值：`ban`（封禁）、`unban`（解封）、`mute`（禁言，需 `durationHours`）、`unmute`、`promote`（提为管理员）、`demote`（降为普通用户）。不能对自己执行，也不能重复降权非管理员。

## 其他

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 存活探测，返回 `{ ok: true }`，可直接用于容器/负载均衡健康检查 |
| GET | `/api/videos` | 列出个人卡片背景视频目录中的媒体文件，返回 `{ videos: ["/videos/xxx.mp4"] }` |
| GET | `/uploads/*` | 本地存储模式下的媒体静态访问（S3 模式下不使用） |
| GET | `/videos/*` | 背景视频静态访问 |

## 约定与陷阱

- 创建类接口返回 200 而不是 201，前端依赖 200 判断成功。
- 敏感词命中时返回 400 且带 `blocked`，前端据此提示是「直接拒绝」还是「已打码（`masked`）」。
- `POST /api/posts` 是 `multipart/form-data`，但字段校验失败发生在文件落盘之后，服务端会清理临时文件；不要在同一请求里重试携带同一批文件。
- 点赞/取消点赞返回的 `likeCount` 是操作后的最新计数，前端直接覆盖本地状态即可，无需再拉详情。
