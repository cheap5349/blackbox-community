import { createApp } from 'vue'
import App from './App.vue'
import { router } from './router.js'
import './style.css'
import './interaction.css'
import './profile.css'

createApp(App).use(router).mount('#app')
