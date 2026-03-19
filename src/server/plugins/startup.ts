import { definePlugin } from 'nitro'
import { initDb } from '../db'
import { reconcileSessions } from '../utils/reconcile'

export default definePlugin(async () => {
  initDb()
  await reconcileSessions()
})
