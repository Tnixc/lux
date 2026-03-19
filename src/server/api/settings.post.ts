import { createError, defineEventHandler, readBody } from 'h3'
import { homedir } from 'node:os'
import { stat, realpath } from 'node:fs/promises'
import { setSetting } from '../utils/settings'

export default defineEventHandler(async (event) => {
  const body = await readBody<{ defaultAgentCli?: string; homeDir?: string }>(event)

  if (body?.defaultAgentCli) {
    setSetting('default_agent_cli', body.defaultAgentCli.trim())
  }

  if (body?.homeDir) {
    const raw = body.homeDir.trim() || homedir()
    const resolved = await realpath(raw).catch(() => null)
    if (!resolved) {
      throw createError({ statusCode: 400, statusMessage: 'home_dir_invalid' })
    }
    const info = await stat(resolved).catch(() => null)
    if (!info?.isDirectory()) {
      throw createError({ statusCode: 400, statusMessage: 'home_dir_invalid' })
    }
    setSetting('home_dir', resolved)
  }

  return { ok: true }
})
