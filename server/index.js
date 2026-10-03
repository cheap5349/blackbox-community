import 'dotenv/config'
import { app } from './app.js'
import { initStorage } from './storage.js'
import { seedDatabase } from './seed.js'

initStorage()
app.listen(process.env.PORT || 3000, () => console.log('API listening on ' + (process.env.PORT || 3000)))
seedDatabase()
