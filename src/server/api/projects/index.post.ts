import { createError, defineEventHandler, readBody } from 'h3'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { homedir } from 'node:os'
import { auditLog } from '../../utils/audit'
import { stat } from 'node:fs/promises'
import path from 'node:path'
import { getDb } from '../../db'
import { projects } from '../../db/schema'
import { ensureSafePath } from '../../utils/paths'
import { getSetting } from '../../utils/settings'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ path?: string; name?: string; icon?: string | null }>(event)
  const rawPath = body?.path?.trim()
  if (!rawPath) {
    throw createError({ statusCode: 400, statusMessage: 'path_required' })
  }

  const homeDir = getSetting('home_dir') || homedir()
  let resolved: string
  try {
    resolved = ensureSafePath(rawPath, homeDir)
  } catch (err) {
    throw err
  }

  const info = await stat(resolved).catch(() => null)
  if (!info?.isDirectory()) {
    throw createError({ statusCode: 400, statusMessage: 'path_not_directory' })
  }

  const db = getDb()
  const existing = db.select().from(projects).where(eq(projects.path, resolved)).get()
  if (existing) {
    throw createError({ statusCode: 409, statusMessage: 'project_exists' })
  }

  const name = body?.name?.trim() || path.basename(resolved)
  const icon = body?.icon?.trim() || null
  const id = nanoid()
  const userId = event.context.userId || null
  const now = Math.floor(Date.now() / 1000)

  db.insert(projects)
    .values([
      {
        id,
        name,
        path: resolved,
        icon,
        createdBy: String(userId),
        createdAt: now,
        updatedAt: now
      }
    ])
    .run()

  auditLog('project_create', { projectId: id, userId, path: resolved })

  return { id, name, path: resolved, icon }
})
