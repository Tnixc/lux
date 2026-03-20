import { realpathSync } from 'node:fs'
import path from 'node:path'
import { createError } from 'h3'

export function ensureSafePath(rawPath: string, homeDirs: string[]) {
  if (!rawPath) {
    throw createError({ statusCode: 400, statusMessage: 'path_required' })
  }
  const segments = rawPath.split(path.sep)
  if (segments.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_path' })
  }
  const resolvedPath = realpathSync(rawPath)
  const withinAny = homeDirs.some((homeDir) => {
    try {
      return isWithin(resolvedPath, realpathSync(homeDir))
    } catch {
      return false
    }
  })
  if (!withinAny) {
    throw createError({ statusCode: 400, statusMessage: 'path_outside_home' })
  }
  return resolvedPath
}

export function isWithin(target: string, base: string) {
  const relative = path.relative(base, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
