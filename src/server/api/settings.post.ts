import { createError, defineEventHandler, readBody } from 'h3'
import { homedir } from 'node:os'
import path from 'node:path'
import { stat, realpath } from 'node:fs/promises'
import { expandHomePath, setSetting } from '../utils/settings'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ defaultAgentCli?: string; homeDir?: string }>(event)

  if (body?.defaultAgentCli) {
    if (process.env.LUX_DEFAULT_AGENT_CLI?.trim()) {
      throw createError({ statusCode: 409, statusMessage: 'default_agent_cli_managed_by_env' })
    }

    setSetting('default_agent_cli', body.defaultAgentCli.trim())
  }

  if (body?.homeDir) {
    if (process.env.LUX_HOME_DIR?.trim()) {
      throw createError({ statusCode: 409, statusMessage: 'home_dir_managed_by_env' })
    }

    const rawPaths = body.homeDir
      .split(path.delimiter)
      .map((p) => p.trim())
      .filter(Boolean)
    if (rawPaths.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'home_dir_invalid' })
    }

    for (const raw of rawPaths) {
      const expanded = expandHomePath(raw) || homedir()
      const resolved = await realpath(expanded).catch(() => null)
      if (!resolved) {
        throw createError({ statusCode: 400, statusMessage: 'home_dir_invalid' })
      }
      const info = await stat(resolved).catch(() => null)
      if (!info?.isDirectory()) {
        throw createError({ statusCode: 400, statusMessage: 'home_dir_invalid' })
      }
    }

    setSetting('home_dir', rawPaths.join(path.delimiter))
  }

  return { ok: true }
})
