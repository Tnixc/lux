import { createError, defineEventHandler, getRouterParam, readBody } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../../db'
import { projects } from '../../../db/schema'
import { auditLog } from '../../../utils/audit'

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'missing_project_id' })
  }

  const body = await readBody<{ icon?: string | null }>(event)
  const rawIcon = body?.icon
  const trimmed = typeof rawIcon === 'string' ? rawIcon.trim() : ''
  const icon = trimmed ? trimmed.slice(0, 8) : null

  const db = getDb()
  const existing = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'project_not_found' })
  }

  const now = Math.floor(Date.now() / 1000)
  db.update(projects).set({ icon, updatedAt: now }).where(eq(projects.id, projectId)).run()

  auditLog('project_icon_update', { projectId, icon })

  return { ok: true, icon }
})
