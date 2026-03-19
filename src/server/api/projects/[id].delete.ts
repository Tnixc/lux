import { createError, defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { projects, sessions } from '../../db/schema'
import { tmuxKillSession } from '../../utils/tmux'
import { removeSessionRuntime } from '../../tmux/session-runtime-registry'
import { auditLog } from '../../utils/audit'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'missing_project_id' })
  }

  const db = getDb()
  const project = db.select().from(projects).where(eq(projects.id, id)).get()
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'project_not_found' })
  }

  const projectSessions = db.select().from(sessions).where(eq(sessions.projectId, id)).all()
  for (const session of projectSessions) {
    try {
      await tmuxKillSession(session.tmuxSession)
    } catch {
      // ignore
    }
    removeSessionRuntime(session.id)
  }

  if (projectSessions.length) {
    db.delete(sessions).where(eq(sessions.projectId, id)).run()
  }
  db.delete(projects).where(eq(projects.id, id)).run()

  auditLog('project_delete', { projectId: id, userId: event.context.userId })

  return { ok: true }
})
