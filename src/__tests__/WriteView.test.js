import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'

// store 必须是真响应式，否则 v-model 与按钮禁用态不会随输入更新
const h = await vi.hoisted(async () => {
  const { reactive } = await import('vue')
  const store = reactive({
    post: { title: '', content: '', communityId: '', images: [], video: null },
    postMessage: '',
    editingPost: null,
    writeFrom: 'home',
    communities: [
      { id: 5, name: '技术闲聊' },
      { id: 9, name: '讨论区' },
    ],
    selectedCommunity: null,
    treeholeCommunity: { id: 9, name: '讨论区' },
    published: 0,
    backs: 0,
    publish() {
      store.published += 1
    },
    goBackFromWrite() {
      store.backs += 1
    },
  })
  return { store }
})

vi.mock('../store.js', () => ({ useStore: () => h.store }))

const WriteView = (await import('../views/WriteView.vue')).default

const file = (name, type = 'image/png') => new File(['x'], name, { type })

const fillReady = (patch = {}) => {
  Object.assign(h.store.post, { title: '标题', content: '正文', communityId: 5, images: [], video: null }, patch)
}

const publishButton = (wrapper) => wrapper.findAll('button').find((b) => /发布帖子|投入树洞|保存修改/.test(b.text()))

beforeEach(() => {
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
    const wrapper = mount(WriteView)

    expect(wrapper.find('input[accept="video/*"]').exists()).toBe(false)
    expect(wrapper.find('input[type="file"][accept="image/*"]').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('视频')
  })

  it('标题有字数上限提示，输入后实时更新', async () => {
    const wrapper = mount(WriteView)
    const counter = wrapper.findAll('.write-count')[0]

    expect(counter.text()).toContain('0/160')

    await wrapper.find('.write-title').setValue('周末歌单')
    expect(wrapper.findAll('.write-count')[0].text()).toContain('4/160')
  })

  it('必填项没填齐时发布按钮不可点，并说明还差什么', async () => {
    const wrapper = mount(WriteView)
    const button = publishButton(wrapper)

    expect(button.attributes('disabled')).toBeDefined()
    expect(wrapper.find('.write-hint').text()).toContain('标题')

    fillReady()
    await wrapper.vm.$nextTick()

    expect(publishButton(wrapper).attributes('disabled')).toBeUndefined()
    expect(wrapper.find('.write-hint').text()).toBe('')
  })

  it('缺社区时同样拦住发布', async () => {
    const wrapper = mount(WriteView)

    fillReady({ communityId: '' })
    await wrapper.vm.$nextTick()

    expect(publishButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.find('.write-hint').text()).toContain('社区')
  })

  it('选中的图片会显示缩略图，并能单独移除', async () => {
    const wrapper = mount(WriteView)
    const input = wrapper.find('input[type="file"]').element
    const files = [file('a.png'), file('b.png')]

    Object.defineProperty(input, 'files', { value: files, configurable: true })
    await wrapper.find('input[type="file"]').trigger('change')

    expect(h.store.post.images).toHaveLength(2)
    expect(wrapper.findAll('.write-preview img')).toHaveLength(2)

    await wrapper.findAll('.write-preview-remove')[0].trigger('click')

    expect(h.store.post.images.map((f) => f.name)).toEqual(['b.png'])
    expect(wrapper.findAll('.write-preview img')).toHaveLength(1)
  })

  it('把图片拖进上传区也会计入待发布图片', async () => {
    const wrapper = mount(WriteView)
    const zone = wrapper.find('.write-drop')

    const event = new Event('drop', { bubbles: true })
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file('drop.png')] } })
    zone.element.dispatchEvent(event)
    await wrapper.vm.$nextTick()

    expect(h.store.post.images.map((f) => f.name)).toEqual(['drop.png'])
  })

  it('被拖入的非图片文件会被忽略', async () => {
    const wrapper = mount(WriteView)

    const event = new Event('drop', { bubbles: true })
    Object.defineProperty(event, 'dataTransfer', { value: { files: [file('clip.mp4', 'video/mp4')] } })
    wrapper.find('.write-drop').element.dispatchEvent(event)
    await wrapper.vm.$nextTick()

    expect(h.store.post.images).toHaveLength(0)
  })

  it('树洞模式显示匿名说明且不出现社区选择', async () => {
    h.store.writeFrom = 'discussions'
    h.store.post.communityId = 9
    const wrapper = mount(WriteView)

    expect(wrapper.find('select').exists()).toBe(false)
    expect(wrapper.find('.write-note').text()).toContain('匿名')
    expect(wrapper.text()).toContain('投入树洞')
  })

  it('编辑模式给出说明并保留保存按钮', async () => {
    h.store.editingPost = { id: 3 }
    h.store.writeFrom = 'profile'
    fillReady()
    const wrapper = mount(WriteView)

    expect(wrapper.find('.write-note').text()).toContain('编辑')
    expect(wrapper.text()).toContain('保存修改')
    expect(wrapper.find('.write-drop').exists()).toBe(false)
  })

  it('点击发布与取消分别调用 store 的方法', async () => {
    const wrapper = mount(WriteView)

    fillReady()
    await wrapper.vm.$nextTick()
    await publishButton(wrapper).trigger('click')
    await wrapper.find('.write-actions .link').trigger('click')

    expect(h.store.published).toBe(1)
    expect(h.store.backs).toBe(1)
  })

  it('后端返回的错误信息会显示出来', async () => {
    h.store.postMessage = '标题、内容和社区不能为空'
    const wrapper = mount(WriteView)

    expect(wrapper.find('.write-message').text()).toContain('不能为空')
  })
})
