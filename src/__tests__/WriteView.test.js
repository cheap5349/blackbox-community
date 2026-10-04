import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// store 必须是真响应式，否则 v-model、计数与按钮禁用态不会随输入更新
const h = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  const { initials, relativeDate } = await import('../utils.js')
  const store = reactive({
    post: { title: '', content: '', communityId: '', images: [], video: null },
    postMessage: '',
    editingPost: null,
    writeFrom: 'home',
    user: { name: 'dante', avatar: null },
    communities: [
      { id: 5, name: '技术闲聊' },
      { id: 9, name: '讨论区' },
    ],
    selectedCommunity: null,
    treeholeCommunity: { id: 9, name: '讨论区' },
    initials,
    relativeDate,
    published: 0,
    backs: 0,
    publish() {
      store.published += 1
      store.post = { title: '', content: '', communityId: '', images: [], video: null }
    },
    goBackFromWrite() {
      store.backs += 1
    },
  })
  return { store }
})

vi.mock('../store.js', () => ({ useStore: () => h.store }))

const WriteView = (await import('../views/WriteView.vue')).default
const { DRAFT_KEY } = await import('../draft.js')

const file = (name, type = 'image/png') => new File(['x'], name, { type })

const fillReady = (patch = {}) => {
  Object.assign(h.store.post, { title: '标题', content: '正文', communityId: 5, images: [], video: null }, patch)
}

const publishButton = (wrapper) => wrapper.findAll('button').find((b) => /发布帖子|投入树洞|保存修改/.test(b.text()))
const tab = (wrapper, label) => wrapper.findAll('.write-tab').find((t) => t.text().includes(label))

// 组件在 window 上挂了键盘监听，用例之间必须真正卸载，否则监听会一层层叠加
const mounted = []
const open = () => {
  const wrapper = mount(WriteView)
  mounted.push(wrapper)
  return wrapper
}

afterEach(() => {
  while (mounted.length) mounted.pop().unmount()
})

beforeEach(() => {
  localStorage.clear()
  h.store.post = { title: '', content: '', communityId: '', images: [], video: null }
  h.store.postMessage = ''
  h.store.editingPost = null
  h.store.writeFrom = 'home'
  h.store.selectedCommunity = null
  h.store.published = 0
  h.store.backs = 0
  URL.createObjectURL = vi.fn(() => 'blob:mock-preview')
  URL.revokeObjectURL = vi.fn()
})

describe('发帖界面', () => {
  it('不再提供视频上传入口', async () => {
    const wrapper = open()

    expect(wrapper.find('input[accept="video/*"]').exists()).toBe(false)
    expect(wrapper.find('input[type="file"][accept="image/*"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('视频')
  })

  it('标题与正文都有字数上限提示，输入后实时更新', async () => {
    const wrapper = open()

    expect(wrapper.findAll('.write-count')[0].text()).toContain('0/160')

    await wrapper.find('.write-title').setValue('周末歌单')

    expect(wrapper.findAll('.write-count')[0].text()).toContain('4/160')
    expect(wrapper.findAll('.write-count')[1].text()).toContain('0/2000')
  })

  it('必填项没填齐时发布按钮不可点，并说明还差什么', async () => {
    const wrapper = open()

    expect(publishButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.find('.write-hint').text()).toContain('标题')

    fillReady()
    await wrapper.vm.$nextTick()

    expect(publishButton(wrapper).attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.write-hint').text()).toBe('')
  })

  it('缺社区时同样拦住发布', async () => {
    const wrapper = open()

    fillReady({ communityId: '' })
    await wrapper.vm.$nextTick()

    expect(publishButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.find('.write-hint').text()).toContain('社区')
  })

  it('右侧预览跟着标题、正文和社区走，空的时候显示占位', async () => {
    const wrapper = open()

    expect(wrapper.find('.preview-title').text()).toBe('标题')
    expect(wrapper.find('.preview-body').text()).toBe('正文')

    fillReady({ title: '周末歌单', content: '这周循环的三首歌' })
    await wrapper.vm.$nextTick()

    expect(wrapper.find('.preview-title').text()).toBe('周末歌单')
    expect(wrapper.find('.preview-body').text()).toContain('这周循环的三首歌')
    expect(wrapper.find('.preview-community').text()).toContain('技术闲聊')
  })

  it('切到匿名倾诉：不需要社区，预览里的作者变成匿名', async () => {
    const wrapper = open()

    expect(wrapper.find('.write-select').exists()).toBe(true)

    await tab(wrapper, '匿名倾诉').trigger('click')

    expect(h.store.writeFrom).toBe('discussions')
    expect(h.store.post.communityId).toBe(9)
    expect(wrapper.find('.write-select').exists()).toBe(false)
    expect(wrapper.find('.preview-author').text()).toContain('匿名')
    expect(wrapper.find('textarea').attributes('placeholder')).toContain('心里话')
  })

  it('从匿名切回图文模式时会清掉树洞社区', async () => {
    const wrapper = open()

    await tab(wrapper, '匿名倾诉').trigger('click')
    await tab(wrapper, '发布图文').trigger('click')

    expect(h.store.writeFrom).toBe('home')
    expect(h.store.post.communityId).toBe('')
    expect(wrapper.find('.write-select').exists()).toBe(true)
  })

  it('选中的图片显示成缩略图，并受后端 9 张上限约束', async () => {
    const wrapper = open()
    const input = wrapper.find('input[type="file"]').element
    const files = Array.from({ length: 12 }, (_, i) => file(`p${i}.png`))

    Object.defineProperty(input, 'files', { value: files, configurable: true })
    await wrapper.find('input[type="file"]').trigger('change')

    expect(h.store.post.images).toHaveLength(9)
    expect(wrapper.findAll('.write-thumb img')).toHaveLength(9)

    await wrapper.findAll('.write-thumb-remove')[0].trigger('click')

    expect(h.store.post.images.map((f) => f.name)).toEqual([
      'p1.png',
      'p2.png',
      'p3.png',
      'p4.png',
      'p5.png',
      'p6.png',
      'p7.png',
      'p8.png',
    ])
    expect(wrapper.findAll('.write-thumb img')).toHaveLength(8)
  })

  it('把图片拖进上传区也会计入待发布图片，非图片文件被忽略', async () => {
    const wrapper = open()
    const zone = wrapper.find('.write-drop')

    const images = new Event('drop', { bubbles: true })
    Object.defineProperty(images, 'dataTransfer', { value: { files: [file('drop.png')] } })
    zone.element.dispatchEvent(images)

    const videos = new Event('drop', { bubbles: true })
    Object.defineProperty(videos, 'dataTransfer', { value: { files: [file('clip.mp4', 'video/mp4')] } })
    zone.element.dispatchEvent(videos)
    await wrapper.vm.$nextTick()

    expect(h.store.post.images.map((f) => f.name)).toEqual(['drop.png'])
  })

  it('工具栏的图片按钮会唤起文件选择', async () => {
    const wrapper = open()
    const input = wrapper.find('input[type="file"]')
    const click = vi.spyOn(input.element, 'click')

    await wrapper.find('.write-tool[aria-label="插入图片"]').trigger('click')

    expect(click).toHaveBeenCalled()
  })

  it('表情会插入到正文光标处', async () => {
    const wrapper = open()
    const body = wrapper.find('.write-body')

    await body.setValue('今天天气')
    body.element.setSelectionRange(2, 2)
    await wrapper.find('.write-tool[aria-label="插入表情"]').trigger('click')
    await wrapper.findAll('.write-emoji')[0].trigger('click')

    expect(h.store.post.content.startsWith('今天')).toBe(true)
    expect(h.store.post.content.length).toBeGreaterThan(4)
  })

  it('存草稿写进本地存储，发布成功后草稿被清掉', async () => {
    const wrapper = open()
    fillReady()
    await wrapper.vm.$nextTick()

    await wrapper.find('.write-draft').trigger('click')

    expect(localStorage.getItem(DRAFT_KEY)).toBeTruthy()
    expect(wrapper.find('.write-draft-state').text()).toContain('已存草稿')

    await publishButton(wrapper).trigger('click')

    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('再进发帖页会自动恢复上次的草稿，并且可以丢弃', async () => {
    localStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({ title: '半截草稿', content: '写到一半', communityId: 5, savedAt: Date.now() })
    )
    const wrapper = open()

    expect(wrapper.find('.write-title').element.value).toBe('半截草稿')
    expect(wrapper.find('.write-draft-state').text()).toContain('草稿')

    await wrapper.find('.write-draft-discard').trigger('click')

    expect(wrapper.find('.write-title').element.value).toBe('')
    expect(localStorage.getItem(DRAFT_KEY)).toBeNull()
  })

  it('编辑已有帖子时不碰草稿，也不给加图', async () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ title: '别人的草稿', content: 'x', savedAt: Date.now() }))
    h.store.editingPost = { id: 3 }
    fillReady({ communityId: 5 })
    const wrapper = open()

    expect(wrapper.find('.write-title').element.value).toBe('标题')
    expect(wrapper.find('.write-drop').exists()).toBe(false)
    expect(wrapper.find('.write-draft').exists()).toBe(false)
    expect(wrapper.text()).toContain('保存修改')
  })

  it('沉浸模式把右栏收起来，标题也进入宽屏编辑', async () => {
    const wrapper = open()

    expect(wrapper.find('.write-shell').classes()).not.toContain('is-immersive')

    await wrapper.find('.write-tool[aria-label="沉浸模式"]').trigger('click')

    expect(wrapper.find('.write-shell').classes()).toContain('is-immersive')
  })

  it('快捷键：Ctrl+Enter 发布，Ctrl+S 存草稿并阻止浏览器保存网页', async () => {
    const wrapper = open()
    fillReady()
    await wrapper.vm.$nextTick()

    const save = new KeyboardEvent('keydown', { key: 's', ctrlKey: true, cancelable: true, bubbles: true })
    window.dispatchEvent(save)
    expect(save.defaultPrevented).toBe(true)
    expect(localStorage.getItem(DRAFT_KEY)).toBeTruthy()

    const send = new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, cancelable: true, bubbles: true })
    window.dispatchEvent(send)
    await wrapper.vm.$nextTick()

    expect(h.store.published).toBe(1)
  })

  it('Esc 回到来源页', async () => {
    const wrapper = open()

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', cancelable: true, bubbles: true }))
    await wrapper.vm.$nextTick()

    expect(h.store.backs).toBe(1)
  })

  it('帮助说明面板列出真实可用的快捷键', async () => {
    const wrapper = open()
    const help = wrapper.find('.write-help').text()

    expect(help).toContain('发布帖子')
    expect(help).toContain('保存草稿')
    expect(help).toContain('Ctrl')
    expect(help).toContain('Esc')
  })

  it('点击发布与取消分别调用 store 的方法', async () => {
    const wrapper = open()
    fillReady()
    await wrapper.vm.$nextTick()

    await publishButton(wrapper).trigger('click')
    await wrapper.find('.write-actions .link').trigger('click')

    expect(h.store.published).toBe(1)
    expect(h.store.backs).toBe(1)
  })

  it('后端返回的错误信息会显示出来', async () => {
    h.store.postMessage = '标题、内容和社区不能为空'
    const wrapper = open()

    expect(wrapper.find('.write-message').text()).toContain('不能为空')
  })
})
