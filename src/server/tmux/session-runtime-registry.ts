import type { Session } from '../db/schema'
import { SessionRuntime } from './session-runtime'

const runtimes = new Map<string, SessionRuntime>()

export function getSessionRuntime(session: Session) {
  let runtime = runtimes.get(session.id)
  if (!runtime) {
    runtime = new SessionRuntime(
      session.id,
      session.tmuxSession,
      session.name,
      session.observedStatus
    )
    runtimes.set(session.id, runtime)
  }
  return runtime
}

export function removeSessionRuntime(sessionId: string) {
  const runtime = runtimes.get(sessionId)
  if (runtime) {
    void runtime.shutdownControlClient()
    runtime.shutdown()
    runtimes.delete(sessionId)
  }
}

export function getRuntime(sessionId: string) {
  return runtimes.get(sessionId) || null
}
