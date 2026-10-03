# 贡献指南

## 环境要求

| 依赖 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | 18+（推荐 20，与 Dockerfile 一致） | 后端用 ESM，`package.json` 已设 `"type": "module"` |
| MySQL | 8.x | 测试需要一个可 `DROP DATABASE` 的账号 |
| npm | 随 Node | 项目用 `package-lock.json`，请用 `npm ci` 保证依赖一致 |

对象存储（MinIO/S3）**不需要**：不配置 `S3_*` 时媒体自动落本地磁盘。

## 首次搭建

```bash
npm ci
cp .env.example .env          # 至少填 DB_PASSWORD 与 JWT_SECRET
mysql -u root -p < server/schema.sql
npm run dev                   # 同时起后端（3000）与前端 Vite（5173）
```

浏览器打开 `http://localhost:5173`。开发模式下前端由 Vite 提供、接口走 3000，两者都需运行。

## 脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 并行启动后端与 Vite 开发服务器 |
| `npm run server` / `npm run client` | 只起其中一端 |
| `npm run build` | 构建前端到 `dist/` |
| `npm start` | 生产模式启动（需先 `npm run build`） |
| `npm test` | 后端 API 测试 + 前端组件测试（完整门禁） |
| `npm run test:server` | 仅后端（`node --test`，会被 `server/test/helpers.js` 重建 `heibox_test`） |
| `npm run test:client` | 仅前端（Vitest + jsdom） |
| `npm run lint` / `npm run lint:fix` | ESLint 9 flat config |
| `npm run format` / `npm run format:check` | Prettier（Markdown 已在 `.prettierignore` 中排除） |

## 测试约定

**新增行为先写失败测试。** 本项目的既有测试都是这样长出来的，例如开场动画的跳过入口、重播入口、样式守卫、模板守卫，每一条都对应一次真实的回归。

- 前端测试在 `src/__tests__/`，用 Vitest + `@vue/test-utils` + jsdom。
  - `intro.test.js`：纯时间轴（`introMotion`）逐幕与字段断言。
  - `PreloadScreen.test.js`：开场组件的逐幕行为、跳过、资源未就绪时的等待。
  - `App.test.js`：应用壳（首访播放、硬兜底放行、重播）。
  - `styles.test.js`：直接读取 `src/style.css` 文本做样式守卫（jsdom 不加载 CSS，这是刻意的）。
  - `templates.test.js`：用 `@vue/compiler-sfc` 编译全部 `.vue`，把模板语法错误提前到测试阶段。
- 后端测试在 `server/test/`，用 `node:test` + `supertest`。
  - `helpers.js:setupDb()` 会 **DROP 并重建 `heibox_test`** 再套用 `server/schema.sql`，因此测试不会污染开发库。
  - `helpers.js:getApp()` 会自动设 `RATE_LIMIT_DISABLED=1`（必须在 `import app` 之前生效）。
  - 测试需要有真实 MySQL；CI 里由 service 容器提供。

改动涉及数据库时，请同时更新 `server/schema.sql`，因为测试库由它初始化。

## 代码风格

提交前请本地跑一遍：

```bash
npm run format:check
npm run lint
npm run test:client && npm run test:server
```

- 格式由 Prettier 决定（无分号、单引号、120 列、LF）。不要手工与它对抗，直接 `npm run format`。
- ESLint 只管正确性类问题（`no-unused-vars`、`vue/attributes-order` 等），格式规则已全部关闭。
- 提交信息用祈使句描述做了什么，例如 `fix: 修正开场动画在减少动态偏好下的跳过时机`。

## 前端约定

- **状态只通过 `src/store.js` 的 `useStore()` 读写**，不要在组件里另建全局状态。
- **模板里不要写内联多语句事件处理器**（`@click="a = 1; b = 2"`）。Prettier 会把它拆成多行，Vue 模板表达式解析失败，而 `vite build` 才报错。收敛成方法，`templates.test.js` 会守住这条线。
- **改开场动画先改 `src/intro.js`**：它是无 DOM、无副作用的纯函数，所有数值都由帧驱动。视觉改动必须同步更新 `src/__tests__/intro.test.js` 的断言，否则等于没有回归保护。
- `prefers-reduced-motion` 的优先级高于任何「首次播放」偏好，新增动效要一并考虑它。
- 新样式加在 `src/style.css`（暗色/亮色两套都要给），交互类动效放 `src/interaction.css`。
- 用户可见文案用中文，代码注释解释「为什么」而不是「做了什么」。

## 后端约定

- 路由模块导出 `Router()`，在 `server/app.js` 挂载；需要登录用 `auth`，需要最新用户状态用 `userState`，发帖/评论加 `requireNotMuted`。
- **SQL 一律参数化**，排序等无法参数化的部分走白名单映射（见 `server/routes/posts.js:89-93`），绝不拼接请求参数。
- 错误消息要能直接展示给用户；未预期的异常统一收敛为「服务器暂时不可用」并可查日志，不要泄露堆栈。
- 新接口的失败路径也要写测试（校验失败、越权、资源不存在），这些分支最容易在重构中被悄悄改坏。
- 界面图标一律用 `src/components/AppIcon.vue` + `src/icons.js` 里的图标名，不要用文本字符充当图标（缺字形时会渲染成方框，看起来像页面缺了内容）。
- 常驻 UI（音频、性能这类）按三层拆：纯逻辑放 `src/*.js` 无副作用模块、状态放 composables、渲染放组件；这样纯逻辑可以直接单测，不必挂载组件。
- 自动播放/自动请求这类会被浏览器策略拦截的行为，必须写"被拒绝也不报错"的降级路径：参考 `src/composables/useBgm.js`——`shouldAutoPlay()` 决定要不要试，失败后挂一次性 `pointerdown / keydown / touchstart` 监听等用户手势续播，绝不把拒绝当成错误弹给用户。
- 主题配色走变量：浅色的粉由 `:root` 的 `--blush-1..4` 统一供色，不要把十六进制色值散落在规则里；背景装饰的粒子数量保持在 `src/components/BackgroundLayers.vue` 的模板字面量里（`src/__tests__/styles.test.js` 用 `layerCount()` 读模板做守卫），抽成常量会让守卫失效。
- 背景装饰走"生成器 → 组件 → 样式"三层：位置与 CSS 变量只在 `src/utils.js` 里算（星尘用 `starField()` 拼 `box-shadow`，一层几百颗星只占一个 DOM 节点），组件只负责按主题渲染数量，`src/style.css` 只把变量落成尺寸、色调与动画。新增装饰层时必须同时补进 `html[data-scrolling]` 的暂停列表（该列表要留在顶层，否则 `topLevelOccurrences` 守卫会红）与 `@media (prefers-reduced-motion: reduce)` 块。
- 音频相关改动：单曲循环靠 `audio.loop`，接缝淡化用 `src/bgm.js` 的 `loopGain()` 包络；改音量要走 `applyLoopGain()`，不要直写 `audio.volume`，否则会覆盖淡化包络。
- 涉及隐私的能力要克制：天气只做到城市级、不展示也不保存 IP，除此之外不做隐式采集；任何新增采集类能力必须显式说明并默认关闭。

## CI 会检查什么

推送到 `main` 或开 PR 时，GitHub Actions 会依次执行：`npm ci` → `format:check` → `lint` → 前端测试 → 后端测试（带 MySQL service）→ `npm run build`。任何一步失败都会阻断合并，本地先跑通可以省一轮往返。

## 提交 PR 前自查

- [ ] `npm run format:check` 与 `npm run lint` 通过。
- [ ] 前后端测试全绿，新行为有对应测试。
- [ ] 改了 `schema.sql` 时，测试库能重建成功（`npm run test:server` 会验证）。
- [ ] 新增环境变量已补进 `.env.example` 与 [CONFIGURATION.md](CONFIGURATION.md)。
- [ ] 新增或改变了接口，已同步 [API.md](API.md)。
- [ ] 用户可见行为变化已同步 `README.md` 或 [ARCHITECTURE.md](ARCHITECTURE.md)。

## 已知环境限制

在受限沙箱（例如把子进程输出通过管道捕获被禁止的 Windows 环境）里，`vitest` 默认池会因 `spawn EPERM` 失败，可改用：

```bash
npx vitest run --pool=threads
```

同理，`vite build` 与 `node --test` 需要能 spawn 子进程；这属于环境限制而非项目问题，正常开发机与 CI 不受影响。
