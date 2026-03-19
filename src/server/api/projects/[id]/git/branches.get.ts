import { createError, defineEventHandler, getRouterParam } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../../db'
import { projects } from '../../../../db/schema'
import { getGitBranches, isGitRepo } from '../../../../utils/git'

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

  return getGitBranches(project.path)
})
