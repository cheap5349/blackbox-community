<script setup>
import { useScrollUi } from '../composables/useScrollUi.js'
const { scrollProgress } = useScrollUi()
</script>

<template>
  <div class="reading-bar" :style="{ transform: `scaleX(${scrollProgress / 100})` }"></div>
</template>
