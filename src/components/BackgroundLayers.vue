<script setup>
import { useTheme } from '../composables/useTheme.js'
import { starField, starStyle, meteorStyle, petalStyle, bloomStyle } from '../utils.js'
const { theme } = useTheme()
// 数量写在这里而不是常量里：styles.test.js 直接读模板数字来守住"星河够密、流星够多、
// 花瓣够多"，也顺便避免装饰层被无声无息地删到只剩一两颗星。
// 星尘（far/mid/band/near）走 box-shadow：一层几百颗星只占一个 DOM 节点，
// 否则光是星星就要几百个节点，滚动时合成开销会直接吃掉帧率。
</script>

<template>
  <!-- 粉色洗层渲染在花层之前：同层叠顺序时 DOM 靠后的在上，洗层太靠上会把花瓣糊掉 -->
  <div v-if="theme === 'light'" class="light-wash" aria-hidden="true"></div>

  <div v-if="theme === 'dark'" class="galaxy-layer" aria-hidden="true">
    <i class="g-field" :style="{ '--field': starField('far') }"></i>
    <i class="g-field" :style="{ '--field': starField('mid') }"></i>
    <i class="g-field" :style="{ '--field': starField('band') }"></i>
    <i class="g-field g-field-near" :style="{ '--field': starField('near') }"></i>
    <i class="g-milky"></i>
    <i v-for="b in 3" :key="'b' + b" class="g-nebula" :style="{ '--b': b }"></i>
    <i v-for="n in 64" :key="'s' + n" class="g-star" :style="starStyle(n)"></i>
    <i v-for="n in 16" :key="'m' + n" class="g-meteor" :style="meteorStyle(n)"></i>
  </div>

  <div v-else class="bloom-layer" aria-hidden="true">
    <i v-for="n in 3" :key="'a' + n" class="bl-aurora" :style="bloomStyle(n, 'aurora')"></i>
    <i v-for="n in 10" :key="'o' + n" class="bl-orb" :style="bloomStyle(n, 'orb')"></i>
    <i v-for="n in 46" :key="'p' + n" class="bl-petal" :style="petalStyle(n)"></i>
    <i v-for="n in 24" :key="'t' + n" class="bl-spark" :style="bloomStyle(n, 'spark')"></i>
  </div>
</template>
