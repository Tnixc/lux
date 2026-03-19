import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'
import { getCookie, setCookie, deleteCookie } from 'h3'
import { eq } from 'drizzle-orm'
import { getDb } from '../db'
import { settings, userSessions } from '../db/schema'

export const AUTH_COOKIE_NAME = 'lux_auth_session'
const SESSION_TTL_DAYS = 30

export function createSessionToken() {
  return randomBytes(32).toString('base64url')
}

export function getSessionSecret() {
  const envSecret = process.env.LUX_SESSION_SECRET
  if (envSecret) return envSecret
  const db = getDb()
  const row = db.select().from(settings).where(eq(settings.key, 'session_secret')).get()
  if (row) return row.value
  const secret = randomBytes(32).toString('hex')
  db.insert(settings).values({ key: 'session_secret', value: secret }).run()
  return secret
}

export function signValue(value: string, secret: string) {
  const sig = createHmac('sha256', secret).update(value).digest()
  return `${value}.${Buffer.from(sig).toString('base64url')}`
}

export function verifySignedValue(value: string, secret: string) {
  const [payload, signature] = value.split('.')
  if (!payload || !signature) return null
  const expected = createHmac('sha256', secret).update(payload).digest()
  const sigBuf = Buffer.from(signature, 'base64url')
  if (sigBuf.length !== expected.length) return null
  if (!timingSafeEqual(sigBuf, expected)) return null
  return payload
}

export function parseCookieHeader(header: string | null) {
  const out: Record<string, string> = {}
  if (!header) return out
  const parts = header.split(/;\s*/)
  for (const part of parts) {
    const idx = part.indexOf('=')
    if (idx === -1) continue
    const key = decodeURIComponent(part.slice(0, idx).trim())
    const value = decodeURIComponent(part.slice(idx + 1).trim())
    if (!key) continue
    out[key] = value
  }
  return out
}

export function getSignedSessionIdFromCookieHeader(header: string | null) {
  const cookies = parseCookieHeader(header)
  const raw = cookies[AUTH_COOKIE_NAME]
  if (!raw) return null
  return verifySignedValue(raw, getSessionSecret())
}

export function getSignedSessionId(event: Parameters<typeof getCookie>[0]) {
  const raw = getCookie(event, AUTH_COOKIE_NAME)
  if (!raw) return null
  return verifySignedValue(raw, getSessionSecret())
}

export function setSessionCookie(
  event: Parameters<typeof setCookie>[0],
  sessionId: string,
  expiresAt: number
) {
  const value = signValue(sessionId, getSessionSecret())
  const secure = !isLocalhost(event)
  setCookie(event, AUTH_COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure,
    path: '/',
    expires: new Date(expiresAt * 1000)
  })
}

export function clearSessionCookie(event: Parameters<typeof deleteCookie>[0]) {
  deleteCookie(event, AUTH_COOKIE_NAME, { path: '/' })
}

export function createSessionExpiry(nowSeconds = Math.floor(Date.now() / 1000)) {
  return nowSeconds + SESSION_TTL_DAYS * 24 * 60 * 60
}

export function touchSessionExpiry(sessionId: string, expiresAt: number) {
  const db = getDb()
  db.update(userSessions).set({ expiresAt }).where(eq(userSessions.id, sessionId)).run()
}

function isLocalhost(event: Parameters<typeof getCookie>[0]) {
  const host = event.req.headers.get('host') || ''
  return host.startsWith('localhost') || host.startsWith('127.0.0.1') || host.startsWith('[::1]')
}
