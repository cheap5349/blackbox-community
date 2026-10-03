import { computed, ref } from 'vue'
import { api } from '../api.js'

/* 个人卡片背景：从 public/videos/ 文件夹随机选一个视频/图片自动播放。
   把视频/图片放进 public/videos/ 文件夹即可，每次打开页面随机挑一个。
   若想固定某个文件，把 profileBgForce 改成 '/videos/xxx.mp4' 即可。 */
const profileBg = ref('')
const profileBgForce = ref('')

export function useProfileBg() {
  const profileBgIsVideo = computed(() => /\.(mp4|webm|ogg|mov)$/i.test(profileBg.value))
  const profileBgVisible = computed(() => Boolean(profileBg.value))
  const loadProfileBg = async () => {
    try {
      if (profileBgForce.value) {
        profileBg.value = profileBgForce.value
        return
      }
      const data = await api('/videos')
      const list = (data.videos || []).filter((f) => /\.(mp4|webm|ogg|mov|jpg|jpeg|png|gif|webp)$/i.test(f))
      if (list.length) profileBg.value = list[Math.floor(Math.random() * list.length)]
    } catch {
      /* 接口不可用时保留默认渐变背景 */
    }
  }
  return { profileBg, profileBgIsVideo, profileBgVisible, loadProfileBg }
}
