import { realpathSync } from 'node:fs'
import path from 'node:path'
import { createError } from 'h3'

export function ensureSafePath(rawPath: string, homeDir: string) {
  if (!rawPath) {
    throw createError({ statusCode: 400, statusMessage: 'path_required' })
  }
  const segments = rawPath.split(path.sep)
  if (segments.includes('..')) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_path' })
  }
  const resolvedHome = realpathSync(homeDir)
  const resolvedPath = realpathSync(rawPath)
  if (!isWithin(resolvedPath, resolvedHome)) {
    throw createError({ statusCode: 400, statusMessage: 'path_outside_home' })
  }
  return resolvedPath
}

export function isWithin(target: string, base: string) {
  const relative = path.relative(base, target)
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
}
