import type { H3Event } from 'h3'
import { createError } from 'h3'

export function assertSameOrigin(event: H3Event) {
  const origin = event.req.headers.get('origin')
  const host = event.req.headers.get('host')
  if (!origin || !host) {
    throw createError({ statusCode: 403, statusMessage: 'invalid_origin' })
  }
  let originHost = ''
  try {
    originHost = new URL(origin).host
  } catch {
    throw createError({ statusCode: 403, statusMessage: 'invalid_origin' })
  }
  if (originHost !== host) {
    throw createError({ statusCode: 403, statusMessage: 'invalid_origin' })
  }
}

export function validateOriginForRequest(request: Request) {
  const origin = request.headers.get('origin')
  if (!origin) return false
  const host = request.headers.get('host') || new URL(request.url).host
  if (!host) return false
  try {
    return new URL(origin).host === host
  } catch {
    return false
  }
}
