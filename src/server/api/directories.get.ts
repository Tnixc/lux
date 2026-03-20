import { defineEventHandler } from 'h3'
import { readdir, realpath, stat } from 'node:fs/promises'
import path from 'node:path'
import { getDb } from '../db'
import { projects } from '../db/schema'
import { isGitRepo } from '../utils/git'
import { getConfiguredHomeDirs } from '../utils/settings'
import { isWithin } from '../utils/paths'

export default defineEventHandler(async () => {
  const homeDirs = getConfiguredHomeDirs()
  const db = getDb()
  const projectRows = db.select({ path: projects.path, id: projects.id }).from(projects).all()
  const projectMap = new Map(projectRows.map((row) => [row.path, row.id]))

  const seen = new Set<string>()
  const result = [] as Array<{
    name: string
    path: string
    isGitRepo: boolean
    isProject: boolean
    projectId: string | null
  }>

  for (const homeDir of homeDirs) {
    let entries
    let resolvedHome
    try {
      entries = await readdir(homeDir, { withFileTypes: true })
      resolvedHome = await realpath(homeDir)
    } catch {
      continue // skip dirs that don't exist or aren't readable
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      if (entry.name.startsWith('.')) continue
      if (entry.name === 'node_modules') continue
      const fullPath = path.join(homeDir, entry.name)
      try {
        const info = await stat(fullPath)
        if (!info.isDirectory()) continue
        const resolved = await realpath(fullPath)
        if (seen.has(resolved)) continue
        if (!isWithin(resolved, resolvedHome)) continue
        seen.add(resolved)
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
  }

  result.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))

  return { roots: homeDirs, entries: result }
})
