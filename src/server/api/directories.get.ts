import { defineEventHandler } from 'h3'
import { readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { homedir } from 'node:os'
import { getDb } from '../db'
import { projects } from '../db/schema'
import { isGitRepo } from '../utils/git'
import { getSetting } from '../utils/settings'
import { isWithin } from '../utils/paths'

export default defineEventHandler(async () => {
  const homeDir = getSetting('home_dir') || homedir()
  const entries = await readdir(homeDir, { withFileTypes: true })
  const resolvedHome = await realpath(homeDir)
  const db = getDb()
  const projectRows = db.select({ path: projects.path, id: projects.id }).from(projects).all()
  const projectMap = new Map(projectRows.map((row) => [row.path, row.id]))

  const result = [] as Array<{
    name: string
    path: string
    isGitRepo: boolean
    isProject: boolean
    projectId: string | null
  }>

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    if (entry.name.startsWith('.')) continue
    if (entry.name === 'node_modules') continue
    const fullPath = path.join(homeDir, entry.name)
    try {
      const info = await stat(fullPath)
      if (!info.isDirectory()) continue
      const resolved = await realpath(fullPath)
      if (!isWithin(resolved, resolvedHome)) continue
      const git = await isGitRepo(resolved)
      const projectId = projectMap.get(resolved) ?? null
      result.push({
        name: entry.name,
        path: resolved,
        isGitRepo: git,
        isProject: projectId !== null,
        projectId
      })
    } catch {
      // ignore unreadable
    }
  }

  result.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))

  return { root: homeDir, entries: result }
})
