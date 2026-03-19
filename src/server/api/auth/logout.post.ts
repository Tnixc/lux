import { defineEventHandler } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { auditLog } from '../../utils/audit'
import { userSessions } from '../../db/schema'
import { clearSessionCookie, getSignedSessionId } from '../../utils/auth'

export default defineEventHandler((event) => {
  const sessionId = getSignedSessionId(event)
  if (sessionId) {
    const db = getDb()
    const session = db
      .select({ userId: userSessions.userId })
      .from(userSessions)
      .where(eq(userSessions.id, sessionId))
      .get()
    db.delete(userSessions).where(eq(userSessions.id, sessionId)).run()
    if (session?.userId) {
      auditLog('auth_logout', { userId: session.userId })
    }
  }
  clearSessionCookie(event)
  return { ok: true }
})
