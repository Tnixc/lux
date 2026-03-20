import { defineWebSocketHandler } from 'h3'
import { eq } from 'drizzle-orm'
import type { Peer } from 'crossws'
import { getDb } from '../../../db'
import { sessions, userSessions } from '../../../db/schema'
import { getAuthMode, getSignedSessionIdFromCookieHeader } from '../../../utils/auth'
import { validateOriginForRequest } from '../../../utils/security'
import { getSessionRuntime } from '../../../tmux/session-runtime-registry'
import type { ClientMessage, HubClient } from '../../../tmux/hub'
import { auditLog } from '../../../utils/audit'

interface WsPeerContext {
  userId?: string
  sessionId?: string
}

interface ConnectionState {
  runtime: ReturnType<typeof getSessionRuntime>
  client: HubClient
  sessionId: string
  userId: string | null
}

const connections = new Map<string, ConnectionState>()

export default defineWebSocketHandler({
  async upgrade(request) {
    const sessionId = parseSessionIdFromUrl(request.url)
    if (!sessionId) {
      return new Response('missing_session_id', { status: 400 })
    }

    if (!validateOriginForRequest(request)) {
      return new Response('invalid_origin', { status: 403 })
    }

    const db = getDb()
    let userId: string | null = null

    if (getAuthMode() !== 'none') {
      const sessionToken = getSignedSessionIdFromCookieHeader(request.headers.get('cookie'))
      if (!sessionToken) {
        return new Response('unauthorized', { status: 401 })
      }

      const userSession = db
        .select()
        .from(userSessions)
        .where(eq(userSessions.id, sessionToken))
        .get()
      if (!userSession || userSession.expiresAt < Math.floor(Date.now() / 1000)) {
        return new Response('session_expired', { status: 401 })
      }

      userId = userSession.userId
    }

    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) {
      return new Response('session_not_found', { status: 404 })
    }

    return { context: { userId, sessionId } }
  },

  open(peer) {
    const sessionId = getSessionIdFromPeer(peer)
    if (!sessionId) {
      peer.close(1008, 'missing_session_id')
      return
    }

    const db = getDb()
    const session = db.select().from(sessions).where(eq(sessions.id, sessionId)).get()
    if (!session) {
      peer.close(1008, 'session_not_found')
      return
    }

    const runtime = getSessionRuntime(session)
    const client = runtime.attachClient(peer)
    const userId = getUserIdFromPeer(peer)
    connections.set(peer.id, { runtime, client, sessionId, userId })

    auditLog('ws_connect', {
      sessionId,
      userId
    })
  },

  message(peer, message) {
    const state = connections.get(peer.id)
    if (!state) return

    let payload: ClientMessage
    try {
      payload = JSON.parse(message.text()) as ClientMessage
    } catch {
      peer.send(JSON.stringify({ t: 'error', code: 'invalid_message', message: 'invalid JSON' }))
      return
    }

    if (!payload || typeof payload !== 'object' || !('t' in payload)) {
      peer.send(
        JSON.stringify({ t: 'error', code: 'invalid_message', message: 'missing message type' })
      )
      return
    }

    state.runtime.handleMessage(state.client, payload)
  },

  close(peer) {
    const state = releaseConnection(peer)
    if (!state) return

    auditLog('ws_disconnect', {
      sessionId: state.sessionId,
      userId: state.userId
    })
  },

  error(peer) {
    const state = releaseConnection(peer)
    if (!state) return

    auditLog('ws_disconnect', {
      sessionId: state.sessionId,
      userId: state.userId
    })
  }
})

function releaseConnection(peer: Peer) {
  const state = connections.get(peer.id)
  if (!state) {
    return null
  }

  state.runtime.detachClient(state.client.peer)
  connections.delete(peer.id)
  return state
}

function getSessionIdFromPeer(peer: Peer) {
  const contextSessionId = (peer.context as WsPeerContext | undefined)?.sessionId
  if (contextSessionId) {
    return contextSessionId
  }
  return parseSessionIdFromUrl(peer.request.url)
}

function getUserIdFromPeer(peer: Peer) {
  return ((peer.context as WsPeerContext | undefined)?.userId || null) as string | null
}

function parseSessionIdFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname
    const match = pathname.match(/^\/api\/sessions\/([^/]+)\/ws\/?$/)
    return match?.[1] ? decodeURIComponent(match[1]) : null
  } catch {
    return null
  }
}
