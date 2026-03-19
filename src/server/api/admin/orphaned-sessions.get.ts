import { defineEventHandler } from 'h3'
import { listOrphanedSessions } from '../../utils/reconcile'

export default defineEventHandler(async () => {
  const sessions = await listOrphanedSessions()
  return { sessions }
})
