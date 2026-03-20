import { createError, defineEventHandler, getRequestURL, sendRedirect, setCookie } from 'h3'
import { randomBytes } from 'node:crypto'
import { getAuthMode, getGithubLoginAllowlist } from '../../utils/auth'

export default defineEventHandler((event) => {
  if (getAuthMode() === 'none') {
    return sendRedirect(event, '/', 302)
  }

  const clientId = process.env.GITHUB_CLIENT_ID
  if (!clientId) {
    throw createError({ statusCode: 500, statusMessage: 'missing_github_client_id' })
  }

  if (getGithubLoginAllowlist().length === 0) {
    throw createError({ statusCode: 500, statusMessage: 'missing_github_allowed_users' })
  }

  const state = randomBytes(16).toString('hex')
  const redirectUri = new URL('/api/auth/callback', getRequestURL(event)).toString()

  setCookie(event, 'lux_oauth_state', state, {
    httpOnly: true,
    sameSite: 'lax',
    secure: !isLocalhost(event),
    path: '/',
    maxAge: 10 * 60
  })

  const oauth = new URL('https://github.com/login/oauth/authorize')
  oauth.searchParams.set('client_id', clientId)
  oauth.searchParams.set('redirect_uri', redirectUri)
  oauth.searchParams.set('state', state)
  oauth.searchParams.set('scope', 'read:user')

  return sendRedirect(event, oauth.toString(), 302)
})

function isLocalhost(event: Parameters<typeof getRequestURL>[0]) {
  const host = event.req.headers.get('host') || ''
  return host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')
}
