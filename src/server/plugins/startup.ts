import { definePlugin } from 'nitro'
import { initDb } from '../db'
import { reconcileSessions } from '../utils/reconcile'

function isVitestRuntime() {
  return (
    process.env.VITEST === 'true' || process.env.VITEST === '1' || process.env.NODE_ENV === 'test'
  )
}

export default definePlugin(async () => {
  if (isVitestRuntime()) {
    return
  }

  initDb()
  await reconcileSessions()
})
