import { defineEventHandler } from 'h3'
import { desc, inArray } from 'drizzle-orm'
import { getDb } from '../../db'
import { projects, sessions } from '../../db/schema'

export default defineEventHandler(() => {
  const db = getDb()
  const projectRows = db.select().from(projects).orderBy(desc(projects.updatedAt)).all()

  if (projectRows.length === 0) {
    return { projects: [] }
  }

  const projectIds = projectRows.map((project) => project.id)
  const sessionRows = db
    .select({
      id: sessions.id,
      projectId: sessions.projectId,
      name: sessions.name,
      agentCli: sessions.agentCli,
      desiredStatus: sessions.desiredStatus,
      observedStatus: sessions.observedStatus,
      createdAt: sessions.createdAt
    })
    .from(sessions)
    .where(inArray(sessions.projectId, projectIds))
    .orderBy(desc(sessions.createdAt))
    .all()

  const sessionsByProject = new Map<string, typeof sessionRows>()
  for (const row of sessionRows) {
    const existing = sessionsByProject.get(row.projectId)
    if (existing) {
      existing.push(row)
    } else {
      sessionsByProject.set(row.projectId, [row])
    }
  }

  return {
    projects: projectRows.map((project) => ({
      ...project,
      sessions:
        sessionsByProject
          .get(project.id)
          ?.map(({ projectId: _projectId, ...session }) => session) ?? []
    }))
  }
})
