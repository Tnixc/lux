import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { sessions } from '../db/schema'
import { tmuxHasSession, tmuxListSessions } from './tmux'

export async function reconcileSessions() {
  const db = getDb()
  const running = db.select().from(sessions).where(eq(sessions.desiredStatus, 'running')).all()

  for (const session of running) {
    const exists = await tmuxHasSession(session.tmuxSession)
    if (session.observedStatus === 'starting') {
      if (exists) {
        db.update(sessions)
          .set({ observedStatus: 'disconnected', lastError: null })
          .where(eq(sessions.id, session.id))
          .run()
      } else {
        db.update(sessions)
          .set({ observedStatus: 'error', lastError: 'creation interrupted' })
          .where(eq(sessions.id, session.id))
          .run()
      }
      continue
    }

    if (exists) {
      db.update(sessions)
        .set({ observedStatus: 'disconnected', lastError: null })
        .where(eq(sessions.id, session.id))
        .run()
    } else {
      db.update(sessions)
        .set({ observedStatus: 'missing', lastError: 'tmux session not found after restart' })
        .where(eq(sessions.id, session.id))
        .run()
    }
  }
}

export async function listOrphanedSessions() {
  const db = getDb()
  const tmuxSessions = await tmuxListSessions()
  const dbSessions = db.select({ name: sessions.tmuxSession }).from(sessions).all()
  const known = new Set(dbSessions.map((row) => row.name))

  return tmuxSessions.filter((name) => name.startsWith('lux-')).filter((name) => !known.has(name))
}
