import { defineMiddleware, createError } from 'nitro/h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { userSessions, users } from '../db/schema'
import {
  createSessionExpiry,
  getSignedSessionId,
  setSessionCookie,
  clearSessionCookie,
  touchSessionExpiry
} from '../utils/auth'
import { assertSameOrigin } from '../utils/security'

export default defineMiddleware((event) => {
  const path = event.path || ''
  // Skip non-API routes and public auth routes (login, callback, logout)
  // /api/auth/me IS protected so the middleware populates event.context.user
  const PUBLIC_AUTH = ['/api/auth/login', '/api/auth/callback', '/api/auth/logout']
  if (!path.startsWith('/api') || PUBLIC_AUTH.some((r) => path.startsWith(r))) {
    return
  }

  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.req.method)) {
    assertSameOrigin(event)
  }

  const sessionId = getSignedSessionId(event)
  if (!sessionId) {
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }

  const db = getDb()
  const session = db
    .select({
      id: userSessions.id,
      userId: userSessions.userId,
      expiresAt: userSessions.expiresAt,
      login: users.login,
      name: users.name,
      avatarUrl: users.avatarUrl
    })
    .from(userSessions)
    .innerJoin(users, eq(userSessions.userId, users.id))
    .where(eq(userSessions.id, sessionId))
    .get()

  if (!session) {
    clearSessionCookie(event)
    throw createError({ statusCode: 401, statusMessage: 'unauthorized' })
  }

  const now = Math.floor(Date.now() / 1000)
  if (session.expiresAt < now) {
    clearSessionCookie(event)
    throw createError({ statusCode: 401, statusMessage: 'session_expired' })
  }

  const nextExpiry = createSessionExpiry(now)
  touchSessionExpiry(sessionId, nextExpiry)
  setSessionCookie(event, sessionId, nextExpiry)

  event.context.userId = session.userId
  event.context.user = {
    id: session.userId,
    login: session.login,
    name: session.name,
    avatarUrl: session.avatarUrl
  }
})
