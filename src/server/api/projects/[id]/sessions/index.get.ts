import { createError, defineEventHandler, getRouterParam } from 'h3'
import { eq, asc } from 'drizzle-orm'
import { getDb } from '../../../../db'
import { projects, sessions } from '../../../../db/schema'

export default defineEventHandler((event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'missing_project_id' })
  }

  const db = getDb()
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'project_not_found' })
  }

  const rows = db
    .select()
    .from(sessions)
    .where(eq(sessions.projectId, projectId))
    .orderBy(asc(sessions.createdAt))
    .all()

  return { sessions: rows }
})
