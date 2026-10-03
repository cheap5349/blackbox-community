import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import DemoNotice from '../components/DemoNotice.vue'
import { DEMO_NOTICE } from '../demo.js'

describe('DemoNotice 静态演示角标', () => {
  it('渲染演示说明与信息图标', () => {
    const wrapper = mount(DemoNotice)

    expect(wrapper.find('aside.demo-notice').exists()).toBe(true)
    expect(wrapper.attributes('role')).toBe('status')
    expect(wrapper.text()).toContain('静态演示版')
    expect(wrapper.text()).toContain(DEMO_NOTICE)
    expect(wrapper.find('svg.app-icon').exists()).toBe(true)
  })

  it('角标本身不可交互，避免挡住底下的入口', () => {
    const wrapper = mount(DemoNotice)

    expect(wrapper.find('button').exists()).toBe(false)
    expect(wrapper.find('a').exists()).toBe(false)
  })
})
