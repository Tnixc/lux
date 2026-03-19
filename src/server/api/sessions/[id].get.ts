import { createError, defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { sessions } from '../../db/schema'
import { getRuntime } from '../../tmux/session-runtime-registry'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'missing_session_id' })
  }

  const db = getDb()
  const session = db.select().from(sessions).where(eq(sessions.id, id)).get()
  if (!session) {
    throw createError({ statusCode: 404, statusMessage: 'session_not_found' })
  }

  const runtime = getRuntime(session.id)

  return {
    id: session.id,
    projectId: session.projectId,
    name: session.name,
    tmuxSession: session.tmuxSession,
    agentCli: session.agentCli,
    desiredStatus: session.desiredStatus,
    observedStatus: session.observedStatus,
    primaryPaneId: session.primaryPaneId,
    lastError: session.lastError,
    lastSeenAt: session.lastSeenAt,
    startedAt: session.startedAt,
    stoppedAt: session.stoppedAt,
    activeWsClients: runtime?.getActiveClientCount() ?? 0,
    createdAt: session.createdAt
  }
})
