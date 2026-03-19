import { createError, defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { stat } from 'node:fs/promises'
import { getDb } from '../../../db'
import { projects, sessions } from '../../../db/schema'
import { tmuxKillSession, tmuxListPanes, tmuxNewSession, tmuxSendKeys } from '../../../utils/tmux'
import { removeSessionRuntime } from '../../../tmux/session-runtime-registry'
import { auditLog } from '../../../utils/audit'

const RESTARTABLE = new Set(['stopped', 'missing', 'error'])

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
  if (!RESTARTABLE.has(session.observedStatus)) {
    throw createError({ statusCode: 400, statusMessage: 'session_not_restartable' })
  }

  const project = db.select().from(projects).where(eq(projects.id, session.projectId)).get()
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'project_not_found' })
  }
  const info = await stat(project.path).catch(() => null)
  if (!info?.isDirectory()) {
    throw createError({ statusCode: 400, statusMessage: 'project_path_missing' })
  }

  try {
    await tmuxKillSession(session.tmuxSession)
  } catch {
    // ignore
  }

  removeSessionRuntime(session.id)

  const now = Math.floor(Date.now() / 1000)
  try {
    await tmuxNewSession(session.tmuxSession, project.path)
    await tmuxSendKeys(session.tmuxSession, session.agentCli)
    const panes = await tmuxListPanes(session.tmuxSession)
    db.update(sessions)
      .set({
        desiredStatus: 'running',
        observedStatus: 'running',
        startedAt: now,
        stoppedAt: null,
        primaryPaneId: panes[0] ?? null,
        lastError: null,
        updatedAt: now
      })
      .where(eq(sessions.id, id))
      .run()

    auditLog('session_restart', { sessionId: id, userId: event.context.userId })
  } catch (err) {
    db.update(sessions)
      .set({ observedStatus: 'error', lastError: (err as Error).message, updatedAt: now })
      .where(eq(sessions.id, id))
      .run()
  }

  return { ok: true }
})
