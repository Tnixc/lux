import { createError, defineEventHandler, getQuery, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../../db'
import { projects } from '../../../../db/schema'
import { getGitDiff, isGitRepo } from '../../../../utils/git'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'missing_project_id' })
  }

  const db = getDb()
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'project_not_found' })
  }

  if (!(await isGitRepo(project.path))) {
    throw createError({ statusCode: 400, statusMessage: 'not_git_repo' })
  }

  const query = getQuery(event)
  const scope = (query.scope as string | undefined) ?? 'unstaged'
  const base = (query.base as string | undefined) ?? 'HEAD'
  if (!new Set(['unstaged', 'staged', 'all']).has(scope)) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_scope' })
  }
  const pathsRaw = (query.paths as string | undefined) ?? ''
  const paths = pathsRaw ? pathsRaw.split(',').map((p) => p.trim()) : []

  return getGitDiff(project.path, {
    scope: scope as 'unstaged' | 'staged' | 'all',
    base,
    paths
  })
})
