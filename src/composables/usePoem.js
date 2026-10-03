import { ref } from 'vue'
import { poems } from '../utils.js'

// 主页诗句打字机：逐字打出 → 停留几秒 → 逐字删除 → 换一首循环
const poemText = ref('')
const poemAuthor = ref('')
let poemCur = poems[0]
let poemTimer = null
let poemIndex = 0
let poemDeleting = false

function pickRandomPoem() {
  poemCur = poems[Math.floor(Math.random() * poems.length)]
  poemAuthor.value = poemCur.author
}
function tickPoem() {
  const full = poemCur.text
  if (!poemDeleting) {
    if (poemIndex < full.length) {
      poemIndex++
      poemText.value = full.slice(0, poemIndex)
      poemTimer = setTimeout(tickPoem, 150)
    } else {
      poemTimer = setTimeout(() => {
        poemDeleting = true
        tickPoem()
      }, 2600)
    }
  } else {
    if (poemIndex > 0) {
      poemIndex--
      poemText.value = full.slice(0, poemIndex)
      poemTimer = setTimeout(tickPoem, 70)
    } else {
      poemDeleting = false
      poemTimer = setTimeout(() => {
        pickRandomPoem()
        tickPoem()
      }, 700)
    }
  }
}

export function usePoem() {
  const startPoemLoop = () => {
    stopPoemLoop()
    pickRandomPoem()
    poemIndex = 0
    poemDeleting = false
    poemText.value = ''
    poemTimer = setTimeout(tickPoem, 400)
  }
  const stopPoemLoop = () => {
    if (poemTimer) {
      clearTimeout(poemTimer)
      poemTimer = null
    }
  }
  return { poemText, poemAuthor, startPoemLoop, stopPoemLoop }
}
