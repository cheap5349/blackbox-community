import { ref } from 'vue'

// 全局轻提示：模块级单例，任意组件可调用
const toasts = ref([])
let seq = 0

export function useToasts() {
  const toast = (message, type = 'success') => {
    const id = ++seq
    toasts.value.push({ id, message, type })
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id)
    }, 2600)
  }
  return { toasts, toast }
}
