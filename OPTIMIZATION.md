# 黑盒社区 — 优化方案与完善路线图

本文件记录项目的安全加固、功能完善与后续演进方向。已完成项可直接验证；待办项按优先级排列，并给出建议与验收标准。

> 与成熟社区系统的完整差距对照见 [`FEATURE-COMPARISON.md`](./FEATURE-COMPARISON.md)；架构、环境配置、API、部署运维、备份恢复与贡献说明见 [`docs/`](./docs/)。

## ✅ 已完成

### A. 开场动画（白场终端风格，参考 [RhineLabUI](https://github.com/LBEILC/RhineLabUI) 的运动技法）

时间轴是纯函数 `introMotion(t)`（`src/intro.js`），渲染层逐帧直写 DOM，不走 Vue 响应式。

复现的是参考实现的**技法**而非画面内容：

| 技法 | 说明 |
|---|---|
| 单调三次插值轨道 `track()` | 逐段缓动会在每个关键帧处速度归零、看上去一顿一顿；单调插值保持段间速度连续，只在整个轨道末尾完全停住。扫描环「2000px → 275px」的长尾就靠这条 |
| 25fps 整数帧打字 `typed()` | 按帧网格切片，逐字输入带机械节奏，不随刷新率忽快忽慢 |
| 硬切换幕 | 幕与幕之间不做交叉淡化，边界帧直接换层 |
| 单帧毛刺 | 指定帧上突变缩放/模糊/字符错位，持续 1~2 帧，用来打断规律性 |

- 五幕 12.24 秒（306 帧）：白场逐字输入 → 圆环+六边形盒标+字母 → 认证终端 → 扫描环收拢 → 欢迎+白闪退出
- 扫描环的半径以引擎坐标（1920×1080 的 SVG viewBox）直接驱动 `r`，不用缩放近似
- `prefers-reduced-motion` 下跳过动画直接进入欢迎态；支持跳过（Enter/Esc/按钮）与重播
- 时间基准在首帧做一次时钟一致性判定：浏览器用 rAF 回调时间戳，合成环境退回 `performance.now()`
- **20 条单测**覆盖插值单调性、打字帧节奏、幕边界互斥、长尾收拢、毛刺帧、异常输入不产生 NaN
- 开场策略：**首访完整播放、之后可重播**（`localStorage['heibox.intro.v2.seen']`，页头「重播开场动画」入口）；`prefers-reduced-motion` 优先级高于该偏好，命中即跳过且不写标记
- 首屏等待真实数据就绪（`store.load()`），**加载失败或超过 4 秒硬兜底仍放行主界面**，绝不永久卡在开场层
- 原先的 FPS 浮层改为页头右上角常驻的**实时性能徽标**（帧率 + `/api/health` 延迟分级，点击展开详情，页面隐藏时暂停采样）
- 天气在**进入页面时**按 IP 解析到城市级并展示，不展示也不保存 IP 地址；除此之外不做任何默认采集

### B. 站内通知系统
- `notifications` 表 + `/api/notifications`（列表 / `unread` / `read`）
- 触发点：点赞、评论、举报提交（通知全部管理员）、账号治理结果
- 三条刻意规则：**不给自己发**、**讨论区互动不发**（保护匿名性）、**同一人同一目标去重**
- 页头铃铛 + 未读角标 + 浮层列表；60 秒低频轮询，页面隐藏时暂停
- 帖子删除后通知级联清理；发起人注销则退回名字快照

### C. 排序与帖子运营
- 白名单排序映射 `latest` / `hot` / `featured`，**不把请求参数拼进 SQL**
- `hot = (点赞 + 2×评论) / (小时数 + 2)^1.5`，时间衰减避免老帖霸榜
- `pinned` 在所有排序中恒在最前；`featured` 可组合 `?featured=1` 单独取精华
- 发现页三个排序页签、卡片置顶/精华标记、后台一键置顶/加精

### D. 用户治理
- `users.status`（`active`/`banned`）与 `users.muted_until`
- **账号状态以数据库为准**：`userState` 中间件在鉴权接口回查一次，
  封禁与撤销管理员**对已签发的旧 token 立即生效**（JWT 无状态，签发后无法撤销）
- 禁言只拦写接口（发帖/评论/点赞），仍可正常浏览
- 自锁保护：管理员不能封禁或降权自己
- 后台用户页签：封禁/解封、禁言（1h/6h/1d/3d/7d）/解禁、角色升降

### E. 敏感词过滤
- 分级：`block` 直接拒绝并回传命中词；`mask` 等长打码后放行
- 对常见绕过做归一化：全角折半角、剔除空白与分隔符、大小写不敏感
- 覆盖发帖 / 评论 / 编辑三条写入路径；违规发帖**先判后写盘**，不留孤儿文件

### F. 安全加固
| 项 | 说明 | 涉及文件 |
|---|---|---|
| JWT 密钥强制 | 弱默认密钥（`dev-secret`/`change-this-secret`）仅限开发使用；生产环境缺失或弱密钥**拒绝启动** | `server/config.js`、`middleware/auth.js`、`middleware/optionalAuth.js`、`routes/auth.js` |
| CORS 白名单 | 默认仅放行本地开发端口，生产需配置 `CORS_ORIGINS` | `server/index.js`、`server/config.js` |
| 上传文件头校验 | 不信任客户端 mimetype，写盘后按文件头（JPEG/PNG/GIF/WebP/MP4）二次校验，非法文件清理并拒绝 | `server/media-utils.js`、`routes/posts.js` |
| 安全响应头 | nosniff / X-Frame-Options / CSP / Referrer-Policy / Permissions-Policy / COOP | `server/security.js`、`server/index.js` |
| 请求限流 | 全局 API 300 次/15 分钟/IP；登录/注册 10 次/15 分钟/IP | `server/security.js`、`server/index.js`、`routes/auth.js` |
| 头像文件存储 | 前端 canvas 压缩 512px → 上传文件落盘 → URL 存库；旧文件自动清理 | `routes/auth.js`、`src/App.vue` |

> 测试逃生口：`RATE_LIMIT_DISABLED=1` 关闭限流。测试要连续注册大量账号，必然超过面向真实用户的阈值；生产不设置该变量，行为不变。

### G. 举报治理 / 帖子编辑 / 工程化
- 举报闭环：`reports` 表、用户端提交、管理端「举报」页签（待处理/已忽略/已删除 + 搜索）
- 用户可编辑自己的帖子（个人中心与详情页入口）
- 前端拆分：`App.vue` 瘦身为外壳，10 个视图组件 + `store.js` + composables，路由懒加载
- 测试：后端 `node:test + supertest` 59 条、前端 `vitest` 201 条（17 个文件，含样式守卫与模板编译守卫），全绿
- 工程质量：ESLint 9 flat config + Prettier，`lint`/`lint:fix`/`format`/`format:check` 脚本；GitHub Actions 在 push/PR 上跑格式检查、lint、前后端测试与生产构建
- 文档体系：`README.md` + `docs/ARCHITECTURE.md`、`docs/CONFIGURATION.md`、`docs/API.md`、`docs/DEPLOYMENT.md`、`docs/BACKUP-RESTORE.md`、`docs/CONTRIBUTING.md`
- 部署：Dockerfile + docker-compose + PM2 配置

### H. 界面图标体系、性能徽标与背景音乐播放器
- **图标体系**：`src/icons.js` 提供 25 个 24×24 描边路径（compass / users / chat / refresh / search / bell / plus / spark / close / arrowRight / arrowUp / comment / edit / settings / info / heart / shield / play / pause / volume / volumeMute / note / activity / sun / moon），由 `src/components/AppIcon.vue` 统一渲染。替换掉原先充当图标的文本字符 `⌁ ◌ ▢ ↻ ⌕ 🔔 ✦ ＋ ⌘ ⌄ ⚑ ✎ ⚙ ✕`——这些字符在部分字体下缺字形，会被渲染成空心方框，看上去就像页面缺了内容
- **实时性能徽标**：`src/performance.js` 纯函数（帧率换算与上下限、延迟分级与格式化、均值）+ `src/composables/usePerformance.js` 单例采样（rAF 计数、5 秒一次 `/api/health`、页面隐藏时跳过、消费者计数归零即清理）+ `src/components/PerfBadge.vue` 折叠/展开两态（`aria-expanded`、`role="status"` 详情）
- **背景音乐播放器**：`src/bgm.js` 纯数据层（曲目清单归一化、音量夹取、偏好读写、`shouldAutoPlay`、`formatTime`）+ `src/composables/useBgm.js` 播放状态机（清单拉取失败回退单曲、进度与定位、`releaseAudio` 释放音轨 + `import.meta.hot` 热更新清理）+ `src/components/BgmPlayer.vue` 左下角常驻黑胶唱片机（唱片沟槽 + 中心标签 + 唱臂，播放时唱片转动、唱臂落盘），点击唱片才向右滑出面板。曲目放 `public/audio/`（单个 `bgm.mp3` 或 `playlist.json`）。修复：此前播放器放在 `.community-page` 内，而 `.page-enter` 的 `pageIn` 动画结束帧残留 `transform`，容器因此成为 fixed 包含块，播放器退化为随文档滚动（"滑到底才看得见"）；现改为挂在容器之外，并把 `pageIn` 的 to 帧收回 `transform: none`
- **自动播放（两层策略）**：`shouldAutoPlay` 改为"只有用户显式暂停过（记录 `off`）才不播"，因此进入页面、曲目加载完即自动尝试播放；浏览器若以"没有用户手势"拒绝，`play()` 不报错，而是挂上一次性的 `pointerdown / keydown / touchstart` 监听——用户第一次操作页面时立刻续播。单曲改用 `audio.loop` 无缝循环（此前 `ended` 里手动 `play()`，容易出现整首歌被打断重来的观感），多曲才在播完后切下一首
- **展开面板**：新增当前曲目区（`.bgm-now`：偏心铜点的小黑胶封面 `.bgm-cover`，播放时缓慢自转）、可拖动的进度条 `.bgm-progress`（含 webkit / moz 滑块样式）与两侧 `m:ss` 时间，控制键居中；面板本身加深到 268px、玻璃拟态 `backdrop-filter: blur(14px) saturate(1.15)` 与顶部铜色描边
- **样式**：`src/style.css` 末尾三组规则——图标内联对齐、徽标（质量指示灯 perf-good/fair/poor 三色）、唱片机（沟槽径向渐变、唱片转动 `bgmSpin`、唱臂落针过渡、播放中呼吸光环、面板玻璃拟态与进度条滑块），均带暗色主题覆盖、`max-width: 760px` 窄屏收敛与 `prefers-reduced-motion: reduce` 降级

### I. 主题背景重做（粉色落英 / 漫天星河）与循环接缝淡化
- **为什么第一版"看不出变化"**：① `html[data-theme='light'] body { background: #faf7f2 }` 把粉底盖成了米白，而 `.community-page` 的粉渐变又从近乎白的 `--blush-1` 起头；② `.light-wash` 与 `.bloom-layer` 同为 `z-index: 0`，洗层在 DOM 里靠后（`opacity: 0.62`）直接把花瓣糊掉；③ 暗色只有 44 颗 1.4–3.8px 的星星与 6 条流星，密度撑不起"漫天 / 肆坠"
- **浅色＝粉色落英**：`--blush-1..4` 加深为 `#ffe9f2 / #ffd9e8 / #ffc4dc / #ffabc9`（红通道接近饱和且明显高于绿蓝，`styles.test.js` 守着这条下限），亮色 `body` 与 `.community-page`（`linear-gradient(168deg, ...)` 打底 + 四团粉光）全部从变量取色；`.light-wash` 降到 `opacity: 0.34` 并渲染到花层之前；新增 `petalStyle(n)` 驱动 `@keyframes petalFall`——8% 淡入、34% 摆向一侧 32vh、68% 被风摆回 74vh、100% 落出 120vh 且刚好转满 `--spin`，46 片花瓣各带自己的尺寸 / 摆幅 / 翻转 / 速度
- **暗色＝漫天星河 + 流星肆坠**：新增 `starField(kind)` 生成 `box-shadow` 星尘（far 260 / mid 150 / band 260 沿银河斜线聚集 / near 90 个点，一层几百颗星只占一个 DOM 节点，`.g-field` 配 `@keyframes fieldTwinkle`）；`.galaxy-layer` 背景换成 8 层银河与星云渐变并新增 `.g-milky`（`inset: -22% -12%`、`rotate(-17deg)`）；`.g-nebula` 改用 `[style*='--b: N']` 属性选择器（前面多了 4 个 `<i class="g-field">`，按 `:nth-of-type` 会错位），删掉 `.galaxy-core`；亮星提到 64 颗、`STAR_SIZES` 加大到 2 / 3.2 / 4.6px 并提亮色调与光晕；新增 `meteorStyle(n)` + `@keyframes meteorFall`，16 颗流星的倾角（`atan2(fy, fx)`）、长度、粗细、速度、延迟、起点全部独立，位移走 `--fx / --fy`（44–70vmax）——从"6 条固定轨迹"变成"各飞各的"；亮核 `::after` 放大到 8px 并叠三层辉光
- **循环接缝淡化**：`src/bgm.js` 新增 `LOOP_FADE_SECONDS = 1.8` 与 `loopGain(currentTime, duration, fade)`（接缝两端线性淡出/淡入；片段短于 `fade * 2` 或时长未知时返回 1），`useBgm.js` 用 `applyLoopGain()` 配合 rAF 补帧跟随播放推进（`timeupdate` 只有约 4Hz，直接在事件里改音量会在接缝处听出阶梯）
- 说明：仓库自带的 `public/audio/bgm.mp3` 实测只有 **27.26 秒**（1136 帧、128 kbps、48 kHz），单曲循环因此每 27 秒回到开头；淡化让接缝不再像"重新播放"，但要听长音乐需替换为完整曲目或配多首 + `playlist.json`
- 测试：`utils.test.js` 新增「漫天星河与落英缤纷的生成器」（星尘点数与格式、银河带聚集比例、流星角度与左右分布、花瓣变量范围），`styles.test.js` 守卫粉色下限、洗层透明度与 DOM 顺序、星空分层与 `meteorFall` / `petalFall` 变量、模板数量下限、滚动暂停仍在顶层；`bgm.test.js` / `useBgm.test.js` 覆盖接缝淡化

### J. 部署到 GitHub 与静态演示模式
- **公开地址**：https://cheap5349.github.io/blackbox-community/ （仓库 https://github.com/cheap5349/blackbox-community ，`main` 分支推送即自动发布）
- **为什么要"演示模式"**：GitHub Pages 只能托管静态文件，本项目却是 Express + MySQL，直接发上去会满屏报错。新增 `src/demo.js`（14 条示例帖 / 5 个社区 / 6 条评论 + 与 `server/routes/posts.js` 同形状的字段，含 hot 与 featured 排序、社区过滤、关键词搜索、分页），`src/api.js` 在 `DEMO_MODE` 下把它当作 `api()` 的实现；写入类请求统一抛一句可读中文提示，`DemoNotice` 角标说明这是只读演示
- **子路径部署**：`vite.config.js` 读 `VITE_BASE_PATH` 决定 `base`；`router` 用 `createWebHistory(import.meta.env.BASE_URL)`；`bgm.js` 的清单与兜底曲目路径、演示版性能徽标的延迟探测目标也都按 `BASE_URL` 拼装，否则会 404
- **工作流**：`.github/workflows/pages.yml` 用 `VITE_DEMO=1` 构建，`cp dist/index.html dist/404.html` 让深链接能落到 SPA 外壳，`touch dist/.nojekyll` 避免 Jekyll 忽略 `assets/` 下划线文件；`index.html` 顺手补全了 doctype / viewport / title / favicon（此前只有两行）
- **顺带修掉的 CI 假失败**：`node --test ... "server/test/*.test.js"` 的引号让 Node 20 把 glob 当字面路径（`Could not find`），后端 59 项在 CI 上从未真正跑过；去掉引号并把两个工作流提到 Node 22 后，CI 与本地（对 MySQL 实测）均 59 项全通过

---

## 🟥 P0 · 生产上线前必须做

| 项 | 现状 | 建议 | 验收标准 |
|---|---|---|---|
| 对象存储 | 文件存本地磁盘 `server/uploads`，单机重启不丢但无冗余 | 迁移到 OSS / S3 / MinIO（`storage.js` 已抽象，配置 `S3_*` 即可），`/uploads` 改为 CDN 地址 | 图片/视频/头像读写均走对象存储，本地磁盘无新增文件 |
| 数据库迁移框架 | `seed.js` 用 `ALTER TABLE ... .catch(ER_DUP_FIELDNAME)` 硬编码迁移 | 引入轻量迁移（如 `knex`/`db-migrate`）管理 schema 版本 | 新增字段/表通过迁移脚本，而非改 seed.js |
| 备份策略 | 流程已文档化（`docs/BACKUP-RESTORE.md`），尚无自动化 | 加系统定时任务与保留策略；每季度做一次恢复演练 | 有自动备份任务与恢复演练记录 |
| 找回密码 | 无，只能靠管理员 | 邮箱验证码重置（需接 SMTP），或后台生成临时密码 | 用户可自助重置密码 |

## 🟧 P1 · 高价值功能完善

| 项 | 现状 | 建议 | 验收标准 |
|---|---|---|---|
| 关注/粉丝关系 | 无 | 新增 `follows` 表 + 个人主页关注数 + 关注信息流 | 可关注/取关，关注流只出现被关注者的帖子 |
| 私信 | 无 | `conversations` + `messages`；需与匿名讨论区隔离 | 一对一会话，未读数进通知角标 |
| 操作审计日志 | 治理操作无留痕 | `moderation_logs` 表 + 后台「操作记录」页签 | 每次封禁/删除/置顶可追溯 |
| @提及 / 引用 | 无 | 解析正文 `@昵称`，建 `reply` 类型通知（类型白名单已预留） | @ 到的人收到通知并可跳转 |
| 富文本与草稿 | 仅纯文本（天然免疫 XSS） | 先上 Markdown 子集 + **服务端白名单清洗**（引入 HTML 前必须做） | 支持加粗/链接/代码块，XSS 用例全被清洗 |
| 帖子管理增强 | ✅ 置顶 / 加精 / 热门排序已完成 | 可继续加「按关注/兴趣」的个性化推荐 | — |

## 🟨 P2 · 工程质量

| 项 | 现状 | 建议 | 验收标准 |
|---|---|---|---|
| 前端拆分 | ✅ 已完成（10 视图 + store + composables） | — | 单文件 < 400 行 |
| 测试 | ✅ 后端 59 + 前端 201 条（17 个文件） | 补管理后台与通知的组件级测试 | `npm test` 全绿 |
| CI | ✅ `.github/workflows/ci.yml`：MySQL service → 格式检查 → lint → 前后端测试 → 生产构建 | — | 每个 PR 自动跑全量门禁 |
| 错误处理统一 | 大量 DB 异常归为「数据库未连接」 | 结构化 `{ code, message }`（`api.js` 已透传 `code`），服务端记日志 | 每个接口错误码可定位到真实原因 |
| Lint / Format | ✅ ESLint 9 flat config + Prettier（`lint`/`lint:fix`/`format`/`format:check`） | 可按需再接入 stylelint 检查 CSS | `npm run lint` 与 `format:check` 通过 |
| 搜索性能 | `LIKE %q%` 全表扫描 | 帖子表加 FULLTEXT（中文需 ngram），或换 MeiliSearch | 万级数据下搜索 < 200ms |
| 缓存层 | 无 | Redis 或内存 LRU 缓存列表接口，写操作按前缀失效 | 首页列表 P95 < 50ms |

## 🟩 P3 · 体验与扩展

| 项 | 建议 |
|---|---|
| PWA | manifest + Service Worker，支持离线壳与安装到桌面 |
| 移动端体验 | 核对窄屏下的排序页签、通知浮层与后台治理控件；触屏设备降级装饰性动画 |
| 内容安全 | 引入富文本前完成 XSS 白名单清洗；可继续接图片审核 |
| SEO | SPA 无 SSR；如需被收录，考虑预渲染或 Nuxt 迁移 |
| 多语言 | 文案集中为 i18n 资源文件 |
| 无障碍 | 通知浮层补焦点陷阱与 Esc 关闭；颜色对比度做一轮审计 |
