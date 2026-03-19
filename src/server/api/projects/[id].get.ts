import { createError, defineEventHandler, getRouterParam } from 'h3'
import { eq, asc } from 'drizzle-orm'
import { getDb } from '../../db'
import { projects, sessions } from '../../db/schema'
import { getGitStatus, isGitRepo } from '../../utils/git'

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

  const sessionRows = db
    .select()
    .from(sessions)
    .where(eq(sessions.projectId, id))
    .orderBy(asc(sessions.createdAt))
    .all()
    .map((row) => ({
      id: row.id,
      name: row.name,
      agentCli: row.agentCli,
      desiredStatus: row.desiredStatus,
      observedStatus: row.observedStatus,
      createdAt: row.createdAt
    }))

  const gitRepo = await isGitRepo(project.path)
  let git: unknown = null
  if (gitRepo) {
    const status = await getGitStatus(project.path)
    git = {
      branch: status.head.ref,
      dirty: status.dirty,
      counts: status.counts
    }
  }

  return {
    id: project.id,
    name: project.name,
    path: project.path,
    icon: project.icon ?? null,
    isGitRepo: gitRepo,
    sessions: sessionRows,
    git
  }
})
