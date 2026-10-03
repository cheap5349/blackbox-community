<script setup>
import { useTheme } from '../composables/useTheme.js'
const { themeSwitching, transitionTo } = useTheme()
</script>

<template>
  <div
    v-if="themeSwitching"
    class="theme-transition"
    :class="transitionTo === 'dark' ? 'to-dark' : 'to-light'"
    aria-hidden="true"
  >
    <div class="tt-sun">
      <span class="tt-sun-disc"></span>
      <span class="tt-sun-glow"></span>
    </div>
    <div class="tt-moon">
      <span class="tt-moon-disc"></span>
      <span class="tt-star" style="left: 22%; top: 30%"></span>
      <span class="tt-star" style="left: 64%; top: 18%"></span>
      <span class="tt-star" style="left: 82%; top: 52%"></span>
      <span class="tt-star" style="left: 40%; top: 66%"></span>
    </div>
    <div class="theme-transition-burst">
      <i v-for="n in 30" :key="'b' + n" :style="{ '--i': n }"></i>
    </div>
  </div>
</template>
