import { createError, defineEventHandler, getRouterParam } from 'h3'
import { tmuxKillSession } from '../../../../utils/tmux'

export default defineEventHandler(async (event) => {
  const name = getRouterParam(event, 'name')
  if (!name) {
    throw createError({ statusCode: 400, statusMessage: 'missing_session_name' })
  }

  await tmuxKillSession(name)
  return { ok: true }
})
