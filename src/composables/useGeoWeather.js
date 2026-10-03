import { ref } from 'vue'
import { weatherEmoji, weatherText } from '../utils.js'

// 进入页面即自动获取城市级天气（IP 定位，无浏览器权限弹窗）；
// 只展示城市名，不保存也不展示 IP 地址。结果缓存 5 分钟，页面间切换不重复打接口。
const GEO_CACHE_MS = 5 * 60 * 1000

const geo = ref(null)
const weather = ref(null)
const geoLoading = ref(false)
let loadedAt = 0

async function loadGeoWeather() {
  if (geoLoading.value) return
  geoLoading.value = true
  try {
    const g = await (await fetch('https://ipwho.is/', { mode: 'cors' })).json()
    if (g && !g.success === false && g.latitude) {
      geo.value = {
        city: g.city || g.region || '未知',
        country: g.country || '',
        region: g.region || '',
        latitude: g.latitude,
        longitude: g.longitude,
      }
    } else {
      const g2 = await (await fetch('https://ipapi.co/json/')).json()
      if (g2 && g2.city) {
        geo.value = {
          city: g2.city,
          country: g2.country_name || '',
          region: g2.region || '',
          latitude: g2.latitude,
          longitude: g2.longitude,
        }
      }
    }
    if (geo.value) {
      const w = await (
        await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${geo.value.latitude}&longitude=${geo.value.longitude}&current=temperature_2m,relative_humidity_2m,weather_code`
        )
      ).json()
      const c = w && w.current
      if (c)
        weather.value = {
          temp: Math.round(c.temperature_2m),
          humidity: Math.round(c.relative_humidity_2m),
          code: c.weather_code,
          emoji: weatherEmoji[c.weather_code] || '🌡️',
          text: weatherText[c.weather_code] || '未知',
        }
    }
    if (geo.value) loadedAt = Date.now()
  } catch {
    /* 网络/接口失败时静默，页面其余部分照常工作 */
  } finally {
    geoLoading.value = false
  }
}

/** 进站自动调用：已有新鲜结果就直接复用，避免每次切页都打一遍接口。 */
export function ensureGeoWeather() {
  if (geo.value && Date.now() - loadedAt < GEO_CACHE_MS) return Promise.resolve()
  return loadGeoWeather()
}

/** "重新获取"按钮与测试用：忘掉上一次的结果。 */
export function resetGeoWeatherCache() {
  geo.value = null
  weather.value = null
  loadedAt = 0
}

export function useGeoWeather() {
  return { geo, weather, geoLoading, loadGeoWeather, ensureGeoWeather, resetGeoWeatherCache }
}
