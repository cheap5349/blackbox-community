// 实时性能指标的纯计算部分：帧率换算、延迟分级与格式化。
// 这些数学必须能被单独验证——组件里只负责渲染。
import { describe, expect, it, vi } from 'vitest'
import {
  averageLatency,
  formatFps,
  formatLatency,
  fpsFromFrames,
  latencyGrade,
  measureLatency,
} from '../performance.js'

describe('fpsFromFrames', () => {
  it('按帧数与耗时换算帧率', () => {
    expect(fpsFromFrames(60, 1000)).toBe(60)
    expect(fpsFromFrames(118, 2000)).toBe(59)
    expect(fpsFromFrames(30, 500)).toBe(60)
  })

  it('四舍五入到整数', () => {
    expect(fpsFromFrames(59, 1000)).toBe(59)
    expect(fpsFromFrames(100, 1620)).toBe(62)
  })

  it('耗时为零或负数时返回 0，绝不产生 Infinity / NaN', () => {
    expect(fpsFromFrames(10, 0)).toBe(0)
    expect(fpsFromFrames(10, -5)).toBe(0)
    expect(fpsFromFrames(0, 1000)).toBe(0)
    expect(fpsFromFrames(undefined, undefined)).toBe(0)
  })

  it('异常帧率被夹在合理区间内', () => {
    expect(fpsFromFrames(100000, 1000)).toBe(240)
  })
})

describe('latencyGrade', () => {
  it('按阈值分为 good / fair / poor', () => {
    expect(latencyGrade(80)).toBe('good')
    expect(latencyGrade(119)).toBe('good')
    expect(latencyGrade(120)).toBe('fair')
    expect(latencyGrade(349)).toBe('fair')
    expect(latencyGrade(350)).toBe('poor')
    expect(latencyGrade(3000)).toBe('poor')
  })

  it('没有样本时是 unknown', () => {
    expect(latencyGrade(null)).toBe('unknown')
    expect(latencyGrade(undefined)).toBe('unknown')
    expect(latencyGrade(NaN)).toBe('unknown')
  })
})

describe('格式化', () => {
  it('延迟带单位，缺样本显示占位符', () => {
    expect(formatLatency(32)).toBe('32 ms')
    expect(formatLatency(32.4)).toBe('32 ms')
    expect(formatLatency(null)).toBe('—')
  })

  it('帧率显示为整数', () => {
    expect(formatFps(60)).toBe('60')
    expect(formatFps(null)).toBe('—')
  })
})

describe('averageLatency', () => {
  it('对样本取平均并四舍五入', () => {
    expect(averageLatency([20, 30, 40])).toBe(30)
    expect(averageLatency([10, 11])).toBe(11)
  })

  it('忽略非法样本', () => {
    expect(averageLatency([20, null, NaN, 40])).toBe(30)
  })

  it('空样本返回 null', () => {
    expect(averageLatency([])).toBeNull()
    expect(averageLatency()).toBeNull()
  })
})

describe('measureLatency', () => {
  it('返回一次请求的往返耗时', async () => {
    const ticks = [100, 148]
    const now = vi.fn(() => ticks.shift())
    const fetcher = vi.fn().mockResolvedValue({ ok: true })
    await expect(measureLatency(fetcher, '/api/health', now)).resolves.toBe(48)
    expect(fetcher).toHaveBeenCalledWith('/api/health', expect.objectContaining({ cache: 'no-store' }))
  })

  it('请求失败时返回 null 而不是抛出', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(measureLatency(fetcher, '/api/health')).resolves.toBeNull()
  })
})
