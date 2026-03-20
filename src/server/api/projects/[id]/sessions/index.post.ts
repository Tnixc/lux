import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../../db'
import { projects, sessions } from '../../../../db/schema'
import { getConfiguredDefaultAgentCli } from '../../../../utils/settings'
import { stat } from 'node:fs/promises'
import { tmuxListPanes, tmuxNewSession, tmuxSendKeys } from '../../../../utils/tmux'
import { removeSessionRuntime } from '../../../../tmux/session-runtime-registry'
import { auditLog } from '../../../../utils/audit'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'missing_project_id' })
  }

  const body = await readBody<{ name?: string; agentCli?: string }>(event)
  const name = body?.name?.trim()
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'name_required' })
  }

  const db = getDb()
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'project_not_found' })
  }

  const info = await stat(project.path).catch(() => null)
  if (!info?.isDirectory()) {
    throw createError({ statusCode: 400, statusMessage: 'project_path_missing' })
  }

  const agentCli = body?.agentCli?.trim() || getConfiguredDefaultAgentCli()
  const id = nanoid()
  const tmuxSession = `lux-${id}`
  const now = Math.floor(Date.now() / 1000)

  db.insert(sessions)
    .values({
      id,
      projectId,
      name,
      tmuxSession,
      agentCli,
      desiredStatus: 'running',
      observedStatus: 'starting',
      createdBy: event.context.userId ? String(event.context.userId) : null,
      createdAt: now,
      updatedAt: now
    })

    .run()

  auditLog('session_create', {
    sessionId: id,
    projectId,
    userId: event.context.userId || null,
    agentCli
  })

  try {
    await tmuxNewSession(tmuxSession, project.path)
    await tmuxSendKeys(tmuxSession, agentCli)
    const panes = await tmuxListPanes(tmuxSession)
    db.update(sessions)
      .set({
        observedStatus: 'running',
        startedAt: now,
        primaryPaneId: panes[0] ?? null,
        lastError: null,
        updatedAt: now
      })
      .where(eq(sessions.id, id))
      .run()
  } catch (err) {
    removeSessionRuntime(id)
    db.update(sessions)
      .set({
        observedStatus: 'error',
        lastError: (err as Error).message,
        updatedAt: now
      })
      .where(eq(sessions.id, id))
      .run()
  }

  return { id, name, tmuxSession, agentCli }
})
