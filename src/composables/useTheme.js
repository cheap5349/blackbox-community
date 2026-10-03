import { ref } from 'vue'

// 亮/暗主题与全屏日月切换动画
const theme = ref(localStorage.theme || 'light')
const themeSwitching = ref(false)
const transitionTo = ref('dark')

export function useTheme() {
  const applyTheme = () => {
    const root = document.documentElement
    root.setAttribute('data-theme', theme.value)
    root.style.colorScheme = theme.value
    localStorage.theme = theme.value
  }
  const toggleTheme = () => {
    if (themeSwitching.value) return
    themeSwitching.value = true
    // 全屏日月切换：动画总长 2200ms。先记录目标主题，让面板按切换方向决定升降。
    transitionTo.value = theme.value === 'light' ? 'dark' : 'light'
    // 动画约 50% 处面板完全盖满屏幕，在此刻(500ms)切换主题，页面被完全遮住。
    window.setTimeout(() => {
      theme.value = transitionTo.value
      applyTheme()
      window.setTimeout(() => {
        themeSwitching.value = false
      }, 1720)
    }, 500)
  }
  return { theme, themeSwitching, transitionTo, applyTheme, toggleTheme }
}
