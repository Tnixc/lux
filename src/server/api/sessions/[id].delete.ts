import { createError, defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { sessions } from '../../db/schema'
import { tmuxKillSession } from '../../utils/tmux'
import { removeSessionRuntime } from '../../tmux/session-runtime-registry'
import { auditLog } from '../../utils/audit'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'missing_session_id' })
  }

  const db = getDb()
  const session = db.select().from(sessions).where(eq(sessions.id, id)).get()
  if (!session) {
    throw createError({ statusCode: 404, statusMessage: 'session_not_found' })
  }

  try {
    await tmuxKillSession(session.tmuxSession)
  } catch {
    // ignore
  }

  removeSessionRuntime(session.id)
  db.delete(sessions).where(eq(sessions.id, id)).run()

  auditLog('session_delete', { sessionId: id, userId: event.context.userId })

  return { ok: true }
})
