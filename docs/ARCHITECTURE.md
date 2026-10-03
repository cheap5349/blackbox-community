# 架构说明

本文说明黑盒社区（blackbox-community）的运行结构、模块职责与关键设计取舍。目标是让新加入的人能在半小时内定位「某个行为该改哪里」。

## 全局视图

```
浏览器（Vue 3 SPA，Vite 构建）
   │  fetch /api/*        Authorization: Bearer <JWT>
   ▼
Express 服务
   ├─ server/app.js      组装中间件与路由（不 listen，供测试复用）
   ├─ server/index.js    启动：initStorage() → listen() → seedDatabase()
   ├─ MySQL 8            7 张表，mysql2/promise 连接池（connectionLimit=10）
   ├─ 对象存储           S3 协议（MinIO / OSS / COS / AWS）；未配置则回退本地磁盘
   └─ dist/ 静态托管     CDN 之外的最简路径，附带 SPA fallback
```

单进程同时承担 API 与前端静态托管：`dist/` 存在时，除 `/api`、`/uploads`、`/videos` 之外的 GET 请求一律回落到 `dist/index.html`，因此前端路由直接刷新可用（见 `server/app.js:59-74`）。

## 前端

| 位置 | 职责 |
| --- | --- |
| `src/main.js` | 挂载应用、注册路由 |
| `src/router.js` | 路由表与前台/后台守卫 |
| `src/store.js` | 全局状态单例（`useStore()`），承载数据加载、鉴权、发布、通知、后台操作 |
| `src/api.js` | fetch 封装：统一注入 Bearer token、解析 `{ message }` 错误 |
| `src/views/` | 页面级组件（Home / Post / Community / Communities / Discussions / Write / Profile / Auth / CreateCommunity / Admin） |
| `src/components/` | 可复用组件（HeaderBar / PreloadScreen / NotificationsPanel / CursorFX / BackgroundLayers / ThemeTransition / ReadingBar / BackTop / ToastsStack / **AppIcon / PerfBadge / BgmPlayer**） |
| `src/composables/` | 组合式逻辑：主题、滚动 UI、入场揭示、卡片背景、诗句、定位天气、**性能采样**、**背景音乐**、Toast |
| `src/icons.js` | 图标路径表（25 个 24×24 描边图标），`iconPaths(name)` 对未知名返回空数组 |
| `src/performance.js` | 性能纯函数：帧率换算与上下限、延迟分级与格式化、均值、`measureLatency(fetcher, url, now)` |
| `src/bgm.js` | 播放器纯数据层：曲目清单归一化、音量夹取、偏好读写、`shouldAutoPlay(storage)`、`formatTime(seconds)`、`loopGain(currentTime, duration, fade)` 与 `LOOP_FADE_SECONDS`（循环接缝的淡出/淡入包络） |
| `src/intro.js` | 开场动画的纯时间轴模型（无 DOM、无副作用） |
| `src/style.css` `src/interaction.css` `src/profile.css` | 主样式 / 交互与动效 / 个人页专项样式 |

### 状态管理

不引入 Pinia/Vuex：`src/store.js` 导出一个 `reactive` 全局状态与操作函数，`useStore()` 返回同一个实例。理由是站点规模有限、跨页共享的状态集中在「当前用户 + 数据缓存 + 主题 + 写帖草稿」，引入状态库的收益抵不过一层抽象。

### 开场动画的分层

开场是本站最重的一段动效，刻意拆成三层，便于单测和逐帧回归：

1. **时间轴（纯函数）**：`src/intro.js` 以 25fps 整数帧为基准（`INTRO_FPS`、`INTRO_DURATION`、帧网格 `Math.floor(seconds * INTRO_FPS + 1e-6) / INTRO_FPS`），对外暴露 `introMotion(frame)` → 一幕的完整视觉快照，以及 `shouldShowIntro({ storage, reducedMotion })`。内部用单调三次插值 `track(keys, frame)` 与按帧切片 `typed(text, frame, start, end)` 生成数值与打字机效果，硬切分幕：`f < 48 ? 'signal' : f < 120 ? 'logo' : f < 190 ? 'auth' : f < 236 ? 'scan' : 'welcome'`。**任何视觉改动都先改这里，并在 `src/__tests__/intro.test.js` 补断言。**
2. **渲染（组件）**：`src/components/PreloadScreen.vue` 用 rAF 驱动 `introMotion`，逐帧直写 DOM 与内联 CSS 变量，不走 Vue 响应式——避免每帧触发组件重渲染。提供跳过按钮（`aria-label="跳过开场动画"`）与键盘跳过。
3. **控制器（应用壳）**：`src/App.vue` 决定何时进出场：`shouldShowIntro()` 决定是否播放；`:ready` 绑定首屏数据是否就绪（`store.load()` 完成），并有 4 秒硬兜底，保证网络异常时绝不卡在开场层；播放完成写 `localStorage['heibox.intro.v2.seen']`；`HeaderBar` 的「重播开场动画」通过 `@replay-intro` 事件回调 `replayIntro()`。

`prefers-reduced-motion` 的优先级高于「首次播放」偏好：命中时立即跳过且不写入已看标记。

### 图标与常驻浮层

界面图标统一走 `src/icons.js`（路径表）→ `src/components/AppIcon.vue`（渲染 `<svg>`，`stroke="currentColor"`，`aria-hidden`）。**不要再用 `⌁ ◌ ▢ ↻ ⌕ 🔔 ✦ ＋` 这类文本字符充当图标**：它们在部分字体下缺字形，会被渲染成空心方框，看上去就像页面缺了内容。

两个常驻浮层同样各分三层：

1. **性能徽标**：`src/performance.js`（帧率与延迟的纯函数）→ `src/composables/usePerformance.js`（rAF 计数、5 秒一次 `/api/health`、页面隐藏时跳过、消费者计数归零即清理）→ `src/components/PerfBadge.vue`（折叠态显示帧率与延迟，展开态以 `role="status"` 显示分级详情）。页头右上角常驻，所有人可见。
2. **背景音乐**：`src/bgm.js`（清单归一化、偏好读写、`shouldAutoPlay`、`formatTime`、`loopGain`）→ `src/composables/useBgm.js`（播放状态机：清单拉取失败回退单曲；进入页面即尝试自动播放；被浏览器自动播放策略拦截时不报错，而是挂一次性 `pointerdown / keydown / touchstart` 监听，用户第一次操作时续播；单曲交给 `audio.loop` 无缝循环并在接缝两端淡化（`applyLoopGain()` + rAF 跟随，因为 `timeupdate` 只有约 4Hz），多曲才在 `ended` 后切歌；`releaseAudio()` 供热更新前释放音轨）→ `src/components/BgmPlayer.vue`（左下角黑胶唱片机：唱片与唱臂即入口按钮，点击才向右滑出面板，面板内有封面、进度条与时间）。音频由使用者放在 `public/audio/` 中。播放器挂在 `.community-page` 容器之外，避免容器上的动画 transform 让它退化成随文档滚动。

### 主题背景的分层

背景装饰同样分三层：`src/utils.js` 的 `starField(kind)` / `starStyle(n)` / `meteorStyle(n)` / `petalStyle(n)` / `bloomStyle(n, kind)` 只按序号算出位置与 CSS 变量——星尘按 `far / mid / band / near` 四类生成 `box-shadow` 列表，一层几百颗星因此只占**一个** DOM 节点；`starStyle` 按 `n % 3` 分远近给 `--sz / --tint / --glow / --tw / --tdelay`；`meteorStyle` 给 `--fx / --fy / --angle / --len / --thick / --dur / --delay`，角度由 `atan2(fy, fx)` 算出，拖尾才会对着飞行方向；`petalStyle` 给 `--szw / --szh / --sway / --rot / --spin / --scale / --alpha`。`src/components/BackgroundLayers.vue` 按主题渲染对应数量（暗色：4 层星尘 + 银河 + 3 星云 + 64 亮星 + 16 流星；亮色：3 极光带 + 10 光斑 + 46 花瓣 + 24 星尘；粉色洗层必须渲染在花层**之前**，否则同层叠顺序下会把花瓣糊掉），`src/style.css` 的 `.galaxy-layer` / `.bloom-layer` 规则把变量落成尺寸、色调、光晕与动画节奏。浅色主题的"粉"由 `:root` 的 `--blush-1..4` 统一供色，**换配色只动这四个变量**。数量坚持写成模板里的字面量：`src/__tests__/styles.test.js` 用 `layerCount()` 直接读模板数字做守卫，抽成常量会让守卫失效。新增装饰层时要同时进 `html[data-scrolling]` 暂停列表（该列表必须留在顶层，`topLevelOccurrences` 守着）与 `prefers-reduced-motion` 块。

天气在进入首页时即请求（`ensureGeoWeather()`，结果缓存 5 分钟），只取城市级名称与天气，**不展示也不保存 IP**；失败时页面提供「重新获取天气」按钮。

### 模板守卫

`src/__tests__/templates.test.js` 用 `@vue/compiler-sfc` 编译 `src/` 下所有 `.vue`，把「模板语法错误」提前到测试阶段。起因是一次真实事故：Prettier 把内联多语句事件处理器（`@click="a = 1; b = 2"`）拆成多行，模板表达式解析失败，而单测与 lint 都不编译模板，只有 `vite build` 报错。**模板里不要写多语句内联处理器，收敛成方法。**

## 后端

| 文件 | 职责 |
| --- | --- |
| `server/app.js` | 组装 CORS、安全头、JSON 解析、静态托管、限流、路由、错误处理；导出 `app` 与 `VIDEOS_DIR` |
| `server/index.js` | `initStorage()` → `listen(PORT)` → `seedDatabase()` |
| `server/config.js` | JWT 密钥与 CORS 白名单的集中校验（生产环境弱密钥直接拒绝启动） |
| `server/db.js` | mysql2 连接池；加载根目录 `.env` |
| `server/security.js` | 安全响应头（含 CSP）与内存限流 |
| `server/storage.js` | S3 与本地磁盘的统一上传/删除接口（`isS3()` 判定） |
| `server/media-utils.js` | 上传文件类型嗅探（不信任 Content-Type） |
| `server/sensitive-filter.js` | 敏感词分级处理（`block` 拒绝 / `mask` 打码）+ `SENSITIVE_RULE_MESSAGE` |
| `server/routes/` | auth / posts / communities / admin / notifications 五个模块，各自 `Router()` |
| `server/middleware/` | `auth`（强制登录）、`userState`（回查封禁与角色）、`requireNotMuted`、`optionalAuth` |
| `server/schema.sql` | 建库建表 DDL（测试库也用它初始化） |
| `server/seed.js` | 幂等种子数据（启动时执行） |
| `server/generate-data.js` | 批量演示数据生成脚本（手动执行） |

### 中间件顺序（`server/app.js:20-31`）

```
cors(白名单 + credentials) → securityHeaders → express.json(6mb)
  → /uploads 静态 → /videos 静态
  → /api 全局限流（300 次 / 15 分钟 / IP）
  → /api/auth（另有 10 次 / 15 分钟的更严限流）→ /api/communities → /api/posts → /api/admin → /api/notifications
  → 统一错误处理（413 体积 / LIMIT_FILE_SIZE / 其余 500 且不泄漏堆栈）
```

### 数据模型（`server/schema.sql`）

| 表 | 用途 | 关键点 |
| --- | --- | --- |
| `users` | 账号 | `role`（user/admin）、`status`（active/banned）、`muted_until`、`avatar MEDIUMTEXT`（存 data URL 或 URL） |
| `communities` | 社区 | `owner_id` → users |
| `posts` | 帖子 | `media JSON`、`pinned`、`featured`、索引 `idx_posts_created`、`idx_posts_community` |
| `comments` | 评论 | 级联删除 |
| `likes` | 点赞 | 复合主键 `(post_id, user_id)` 天然去重 |
| `reports` | 举报 | `status` pending/resolved、`handled_by`、`handled_at` |
| `notifications` | 站内通知 | `actor_id`（SET NULL）、`is_read`、索引 `idx_notifications_user` |

## 关键设计决策

- **每次请求回查用户状态**：中间件 `userState` 按 token 里的 `id` 重新查库，确认未封禁并取最新 `role`。代价是每请求一次查询，换来的是「封禁 / 降权立即生效」，旧 token 无法继续用管理员权限（见 `server/routes/admin.js:12-14`）。
- **排序白名单**：`server/routes/posts.js:89-93` 把 `sort` 参数映射为固定 SQL 片段，绝不拼接请求参数到 `ORDER BY`。`hot` 用点赞 + 2×评论做时间衰减。
- **树洞匿名在查询层完成**：社区名为「讨论区」时，返回给前端的作者字段统一替换为「匿名」（`server/routes/posts.js:36-38`），而不是靠前端隐藏。
- **对象存储可回退**：S3 未配置时写入 `server/uploads` 并由 Express 静态托管，本地开发与自动化测试不需要任何外部服务；S3 模式下临时文件上传后立即清理（`server/routes/posts.js:72-81`）。
- **限流是内存实现**：按 IP 计数，单实例有效。多实例部署必须换成 Redis 限流，否则每个副本各自计数。`RATE_LIMIT_DISABLED=1` 是给自动化测试的显式逃生口，生产不要设置。
- **上传大小上限**：JSON 体 6 MB、单个媒体文件 50 MB，超限返回 413 与可读提示。

## 已知边界

- 未做 SSR：首屏依赖 JS，SEO 不在当前目标内。
- 未做多实例会话共享：JWT 无状态，但限流与热点缓存是进程内的。
- 实时能力靠轮询：未读通知每 60 秒拉取一次，没有 WebSocket。
