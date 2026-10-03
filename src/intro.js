// 开场动画时间轴（白场终端风格）。
//
// 参考 RhineLabUI 的开场做法（https://github.com/LBEILC/RhineLabUI 的 src/boot-motion.ts /
// src/boot-tracks.ts），这里复现的是它的**运动技法**，而不是它的画面内容：
//
//   1. 关键帧轨道（track）用**单调三次插值**，而不是每段各自缓动。
//      逐段缓动会在每个关键帧处速度归零，看上去一顿一顿；单调三次插值保持
//      段间速度连续，加速段一路冲进减速段，只在整个轨道末尾才完全停住。
//      开场里“环从 2000px 收到 275px”这类大位移靠的就是这条长尾。
//   2. 打字按**整数帧**切片（25fps），不是按连续时间浮点取整。
//      逐字输入因此带真实的机械节奏，不会因为刷新率变化而忽快忽慢。
//   3. 幕与幕之间是**硬切**（discrete cut），不做交叉淡入淡出。
//      参考实现是在某个帧号上把上层元素直接切掉，这里沿用同一手法。
//   4. 少量**单帧毛刺**（glitch）：指定帧上突变缩放 / 模糊 / 字符错位，
//      持续 1~2 帧，用来打断规律性。

export const INTRO_STORAGE_KEY = 'heibox.intro.v2.seen'

// 25fps（与参考实现一致），1 帧 = 40ms
export const INTRO_FPS = 25
export const FRAME_MS = 1000 / INTRO_FPS

// 12.24s @25fps = 306 帧。白场退出在这一帧之后收尾。
const TOTAL_FRAMES = 306
export const INTRO_DURATION = TOTAL_FRAMES / INTRO_FPS

const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value))
const progress = (t, a, b) => clamp((t - a) / (b - a))

/** 单帧命中判定：给定帧号是否落在这些离散帧里（用于硬切与毛刺）。 */
const atFrame = (frame, frames) => frames.includes(frame)

/**
 * 单调三次插值轨道：在关键帧之间保持速度连续，避免每段缓动带来的顿挫。
 * 与参考实现 src/boot-tracks.ts 的 track() 同构。
 */
export function track(keys, frame) {
  if (!keys.length) return 0
  if (frame <= keys[0][0]) return keys[0][1]
  const last = keys.length - 1
  if (frame >= keys[last][0]) return keys[last][1]

  const slope = (i) => (keys[i + 1][1] - keys[i][1]) / (keys[i + 1][0] - keys[i][0])
  const tangent = (i) => {
    if (i === 0) return slope(0)
    if (i === last) return slope(last - 1)
    const a = slope(i - 1)
    const b = slope(i)
    // 拐点处（斜率变号）压平，保证单调、不过冲
    if (a * b <= 0) return 0
    const h0 = keys[i][0] - keys[i - 1][0]
    const h1 = keys[i + 1][0] - keys[i][0]
    const w0 = 2 * h1 + h0
    const w1 = h1 + 2 * h0
    return (w0 + w1) / (w0 / a + w1 / b)
  }

  let i = 0
  while (frame > keys[i + 1][0]) i++
  const h = keys[i + 1][0] - keys[i][0]
  const p = (frame - keys[i][0]) / h
  return (
    (2 * p ** 3 - 3 * p ** 2 + 1) * keys[i][1] +
    (p ** 3 - 2 * p ** 2 + p) * h * tangent(i) +
    (-2 * p ** 3 + 3 * p ** 2) * keys[i + 1][1] +
    (p ** 3 - p ** 2) * h * tangent(i + 1)
  )
}

/** 逐字输入：按整数帧切片，保证 25fps 下的机械节奏。 */
export function typed(text, frame, start, end) {
  if (frame < start) return ''
  if (frame >= end) return text
  const shown = 1 + Math.floor(((frame - start) * (text.length - 1)) / (end - start))
  return text.slice(0, Math.min(text.length, shown))
}

export function shouldShowIntro({ storage = localStorage, reducedMotion = false } = {}) {
  return !reducedMotion && storage.getItem?.(INTRO_STORAGE_KEY) !== '1'
}

// ── 轨道数据 ────────────────────────────────────────────────────────────────
// 布局按参考实现的 1920×1080 基准设计，元素尺寸在 CSS 里用 vmin 等比缩放。

// 扫描环半径：2000 → 275，前 40 帧吃掉绝大部分位移，之后是极长的收尾。
// 这是“长尾”最直观的一处，也是逐段缓动做不出来的手感。
const SCAN_RADIUS = [
  [190, 2000],
  [195, 1540],
  [200, 1095],
  [203, 895],
  [208, 650],
  [213, 492],
  [218, 385],
  [223, 320],
  [227, 287],
  [230, 275],
  [232, 273],
  [235, 271],
  [240, 268],
  [250, 265],
  [258, 252],
]

// 外圈起止角（度）：从 470° 扫到 -90°，滑过一整圈多一点
const SCAN_OUTER_START = [
  [190, 470],
  [195, 364],
  [200, 276],
  [205, 159],
  [210, 98],
  [215, 49],
  [220, 13],
  [227, -23],
  [232, -57],
  [240, -70],
  [258, -90],
]
const SCAN_OUTER_SWEEP = [
  [190, 30],
  [195, 105],
  [200, 170],
  [205, 241],
  [210, 270],
  [215, 295],
  [220, 313],
  [227, 331],
  [232, 338],
  [240, 348],
  [258, 360],
]

// 内圈：半径反向“收拢”，制造两环不同向的对角解密感
const SCAN_INNER_RADIUS = [
  [190, 124],
  [195, 123],
  [200, 117],
  [205, 112],
  [210, 107],
  [215, 104],
  [220, 101],
  [230, 97],
  [240, 94],
  [258, 88],
]
const SCAN_INNER_ORBIT = [
  [190, -20],
  [195, 14],
  [200, 93],
  [205, 121],
  [210, 141],
  [215, 155],
  [220, 166],
  [227, 178],
  [232, 185],
  [240, 195],
  [258, 201],
]

// 环绕点：常驻半径，随扫描环一起收
const SCAN_DOT_RADIUS = [
  [190, 0],
  [195, 1],
  [200, 5.6],
  [210, 7],
  [220, 7.8],
  [232, 8],
  [258, 8],
]

// 标题字距：从很松收到 0，代替常见的整体缩放
const TRACK_IN = [
  [236, 26],
  [241, 26],
  [245, 17],
  [249, 9],
  [253, 4],
  [257, 1.4],
  [262, 0],
  [298, 0],
]

// 欢迎标题的墨迹落位：长尾减速，与参考的 brandTrack 同构
const WELCOME_X = [0, 30, 218, 104, 46, 34, 26, 22, 20, 17, 13, 10, 8, 6, 4, 3, 2, 1, 0]
const WELCOME_INK_KEYS = WELCOME_X.map((x, i) => [i, x])

// 高亮扫过：先慢、中段极快、再长尾收住（对应 CSS 里标题遮罩的宽度变化）
const HIGHLIGHT_KEYS = [
  [276, 4],
  [277, 39],
  [280, 225],
  [281, 261],
  [282, 288],
  [283, 310],
  [284, 328],
  [285, 343],
  [286, 356],
  [287, 366],
  [288, 375],
  [289, 382],
  [290, 389],
  [291, 394],
  [292, 398],
  [293, 402],
  [294, 405],
  [295, 407],
  [296, 408],
  [297, 409],
  [298, 410],
  [299, 410],
]

// 退出：画面收拢 + 模糊 + 白场淹没
const EXIT_SCALE = [
  [300, 1],
  [302, 0.9],
  [305, 0.54],
  [306, 0.54],
]
const EXIT_BLUR = [
  [300, 0],
  [302, 2.4],
  [305, 8],
  [306, 8],
]
const WHITE_KEYS = [
  [298, 0],
  [300, 0.14],
  [302, 0.52],
  [304, 0.88],
  [306, 1],
]

const LOGO_SCALE = [
  [48, 1.34],
  [52, 1.2],
  [58, 1.08],
  [66, 1.02],
  [80, 1],
  [120, 1],
]
const LOGO_ROTATE = [
  [48, -7],
  [56, -3.4],
  [68, -1.1],
  [84, 0],
  [120, 0],
]

/**
 * 把播放时间映射成一份纯数据状态，交给渲染层逐帧直写 DOM。
 * 全部取值都保证有限，任何时间输入（含 NaN / 负数）都不会渲染出 NaN。
 */
export function introMotion(time = 0) {
  const seconds = Number.isFinite(time) ? Math.max(0, time) : 0
  // 帧号取整到 25fps 网格：打字与硬切都落在帧边界上。
  const t = Math.floor(seconds * INTRO_FPS + 1e-6) / INTRO_FPS
  const f = Math.round(t * INTRO_FPS)

  // ── 硬切分幕 ──
  // 参考实现用一串帧号阈值直接切层，这里同构：没有交叉淡化，边界帧即换幕。
  const stage = f < 48 ? 'signal' : f < 120 ? 'logo' : f < 190 ? 'auth' : f < 236 ? 'scan' : 'welcome'

  // ── 第一幕：白场 + 逐字输入 ──
  const signalText = typed('COMMUNITY ACCESS REQUIRED', f, 5, 45)
  // 第 46 帧单帧压暗，作为换幕前的“断电”提示
  const signalOpacity = f >= 5 && f < 48 ? (f === 46 ? 0.25 : 1) : 0
  const gridOpacity = f < 190 ? 0.3 : 0

  // ── 第二幕：圆环 + 标志 + 字母 ──
  const logo = {
    // 边界帧 48 就要可见；这里必须按帧号判断，用秒数（t>=2 对应第 50 帧）
    // 会让第二幕的头两帧整个消失。
    opacity: f >= 48 && f < 120 ? 1 : 0,
    scale: track(LOGO_SCALE, f),
    rotate: track(LOGO_ROTATE, f),
    // 圆环描边进度（pathLength=1，所以就是 0→1 的分数）
    ringProgress: clamp(progress(f, 50, 88)),
    ringOpacity: track(
      [
        [48, 0],
        [50, 0.45],
        [54, 0.9],
        [58, 1],
        [120, 1],
      ],
      f
    ),
    // 六边形本体在第 62 帧之后才起笔，让圆环先到位
    hexProgress: clamp(progress(f, 62, 104)),
    markOpacity: track(
      [
        [62, 0],
        [64, 0.5],
        [68, 1],
        [120, 1],
      ],
      f
    ),
    letters: typed('HEIBOX', f, 88, 118),
    lettersOpacity: f >= 88 && f < 120 ? 1 : 0,
  }

  // ── 第三幕：认证终端 ──
  // 三行消息错峰打字；第 152/153 与 178 帧是单帧毛刺。
  const authLines = [
    typed('IDENTITY CONFIRMED', f, 128, 150),
    f >= 156 ? 'OPERATOR : ANONYMOUS' : '',
    typed('ESTABLISHING LINK', f, 164, 186),
  ]
  const glitch = atFrame(f, [152, 153, 178])
  const auth = {
    opacity: f >= 126 && f < 190 ? 1 : 0,
    lines: authLines,
    // 毛刺帧上叠一层错位方块，制造信号错位；非毛刺帧为空
    glitch,
    glitchText: glitch ? '▓▓▒▒ ██ ░░░▒ ▓█' : '',
  }

  // ── 第四幕：扫描环收拢 ──
  const ringRadius = track(SCAN_RADIUS, f)
  const scanProgress = track(
    [
      [190, 0],
      [191, 0.18],
      [193, 0.6],
      [196, 1],
      [230, 1],
      [234, 0],
    ],
    f
  )
  const scanGlitch = atFrame(f, [204, 205, 219])
  const extraOrbit = track(
    [
      [190, 4],
      [195, 2],
      [200, 0.5],
      [204, 0],
      [258, 0],
    ],
    f
  )
  const scan = {
    opacity: scanProgress,
    // 半径以 1920×1080 引擎坐标表达；渲染层用 viewBox 0 0 1920 1080 承载，
    // 所以 2000 → 275 这种跨量级收拢可以直接驱动 r，不必靠缩放近似。
    ringRadius,
    outerRadius: ringRadius * 1.125,
    innerRadius: track(SCAN_INNER_RADIUS, f),
    dotRadius: track(SCAN_DOT_RADIUS, f),
    orbitRadius: ringRadius + track(SCAN_DOT_RADIUS, f) + extraOrbit,
    outerStart: track(SCAN_OUTER_START, f),
    outerSweep: track(SCAN_OUTER_SWEEP, f),
    innerOrbit: track(SCAN_INNER_ORBIT, f),
    scale: scanGlitch ? 1.94 : 1,
    blur: scanGlitch ? 2.2 : 0,
  }

  // 权限文字：先渐显，末尾逐帧砸掉（对应参考的 permissionOpacity 轨道）
  const permissionOpacity =
    f < 232
      ? progress(f, 224, 232)
      : track(
          [
            [232, 1],
            [233, 0.4],
            [234, 0.25],
            [235, 0.1],
            [236, 0],
          ],
          f
        )
  const permissionText = typed('PERMISSION AUTHORIZED', f, 224, 238)
  // 字距从 26px 收到 0：不靠缩放，靠字距把一行字“收紧”
  const tracking = track(TRACK_IN, f)

  // ── 第五幕：欢迎 + 白闪退出 ──
  const welcomeIndex = f - 236
  const welcomeVisible = f >= 236 && f < 302
  const welcome = {
    visible: welcomeVisible,
    // 前 4 帧是硬切序列：标题板闪入 → 墨迹 → 落位
    panelFlash: welcomeIndex >= 0 && welcomeIndex < 4 ? [1, 0, 1, 1][welcomeIndex] : 1,
    titleInk: welcomeIndex >= 0 && welcomeIndex < 4 ? [0, 0.2, 1, 1][welcomeIndex] : 1,
    x: track(WELCOME_INK_KEYS, f - 236 - 0),
    brandOpacity: track(
      [
        [240, 0],
        [242, 0.4],
        [244, 0.7],
        [246, 1],
        [302, 1],
      ],
      f
    ),
    brand: 'WELCOME TO HEIBOX',
    communityOpacity: track(
      [
        [262, 0],
        [265, 0.45],
        [268, 1],
        [302, 1],
      ],
      f
    ),
    highlight: track(HIGHLIGHT_KEYS, f),
  }

  const exitScale = track(EXIT_SCALE, f)
  const exit = {
    scale: exitScale,
    blur: track(EXIT_BLUR, f),
    white: track(WHITE_KEYS, f),
    // 白闪起势时把整层淡掉，避免看到元素边缘
    contentOpacity: 1 - Math.pow(clamp(progress(f, 300, 306)), 3),
  }

  return {
    t,
    f,
    stage,
    signalText,
    signalOpacity,
    gridOpacity,
    logo,
    auth,
    scan,
    permissionOpacity,
    permissionText,
    tracking,
    welcome,
    exit,
    // 兼容旧调用方：早期版本读的是这些字段名
    markProgress: logo.ringProgress,
    ringProgress: clamp(progress(f, 190, 232)),
    welcomeOpacity: welcome.brandOpacity,
    welcomeText: welcome.brand,
  }
}
