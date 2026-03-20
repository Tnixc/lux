import {
  createError,
  defineEventHandler,
  deleteCookie,
  getCookie,
  getQuery,
  getRequestURL,
  redirect
} from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../../db'
import { auditLog } from '../../utils/audit'
import { userSessions, users } from '../../db/schema'
import {
  createSessionExpiry,
  createSessionToken,
  getAuthMode,
  getGithubLoginAllowlist,
  isGithubLoginAllowed,
  setSessionCookie
} from '../../utils/auth'

export default defineEventHandler(async (event) => {
  if (getAuthMode() === 'none') {
    return redirect('/', 302)
  }

  const { code, state } = getQuery(event)
  const cookieState = getCookie(event, 'lux_oauth_state')

  if (!code || !state || !cookieState || state !== cookieState) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_oauth_state' })
  }

  const clientId = process.env.GITHUB_CLIENT_ID
  const clientSecret = process.env.GITHUB_CLIENT_SECRET
  if (!clientId || !clientSecret) {
    throw createError({ statusCode: 500, statusMessage: 'missing_github_client_secret' })
  }

  const redirectUri = new URL('/api/auth/callback', getRequestURL(event)).toString()

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
      state
    })
  })

  if (!tokenRes.ok) {
    const error = await tokenRes.text()
    throw createError({ statusCode: 500, statusMessage: error })
  }

  const tokenData = (await tokenRes.json()) as { access_token?: string }
  if (!tokenData.access_token) {
    throw createError({ statusCode: 500, statusMessage: 'missing_access_token' })
  }

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${tokenData.access_token}`,
      'User-Agent': 'lux'
    }
  })

  if (!userRes.ok) {
    const error = await userRes.text()
    throw createError({ statusCode: 500, statusMessage: error })
  }

  const user = (await userRes.json()) as {
    id: number | string
    login: string
    name?: string | null
    avatar_url?: string | null
  }

  const allowlist = getGithubLoginAllowlist()
  if (allowlist.length === 0) {
    throw createError({ statusCode: 500, statusMessage: 'missing_github_allowed_users' })
  }
  if (!isGithubLoginAllowed(user.login)) {
    throw createError({ statusCode: 403, statusMessage: 'forbidden' })
  }

  const db = getDb()
  const userId = String(user.id)
  const existing = db.select().from(users).where(eq(users.id, userId)).get()
  if (existing) {
    db.update(users)
      .set({ login: user.login, name: user.name ?? null, avatarUrl: user.avatar_url ?? null })
      .where(eq(users.id, userId))
      .run()
  } else {
    db.insert(users)
      .values({
        id: userId,
        login: user.login,
        name: user.name ?? null,
        avatarUrl: user.avatar_url ?? null
      })
      .run()
  }

  const sessionId = createSessionToken()
  const expiresAt = createSessionExpiry()
  db.insert(userSessions).values({ id: sessionId, userId, expiresAt }).run()

  auditLog('auth_login', { userId, login: user.login })

  setSessionCookie(event, sessionId, expiresAt)
  deleteCookie(event, 'lux_oauth_state', { path: '/' })

  return redirect('/', 302)
})
