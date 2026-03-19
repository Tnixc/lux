import type { Peer } from 'crossws'
import { getDb } from '../db'
import { sessions } from '../db/schema'
import { eq } from 'drizzle-orm'
import { TmuxManager, MissingSessionError } from './manager'
import { SessionHub, type ClientMessage, type HubClient } from './hub'
import { TMUX_BIN, TMUX_SOCKET } from '../utils/tmux'

const IDLE_TIMEOUT_MS = 30_000
const INITIAL_STATE_SYNC_ATTEMPTS = 4
const INITIAL_STATE_SYNC_DELAY_MS = 250

export class SessionRuntime {
  readonly sessionId: string
  private manager: TmuxManager | null = null
  private hub: SessionHub
  private idleTimer: NodeJS.Timeout | null = null
  private stateSyncTimer: NodeJS.Timeout | null = null
  private observedStatus: string
  private activeClients = 0

  constructor(
    sessionId: string,
    private readonly tmuxSession: string,
    private readonly sessionName: string,
    observedStatus: string
  ) {
    this.sessionId = sessionId
    this.observedStatus = observedStatus
    this.hub = new SessionHub(
      this.sessionId,
      this.tmuxSession,
      this.sessionName,
      (line) => {
        if (!this.manager) {
          throw new Error('tmux control client unavailable')
        }
        this.manager.send(line)
      },
      () => this.observedStatus
    )
  }

  attachClient(peer: Peer): HubClient {
    const client = this.hub.addClient(peer)
    this.activeClients += 1
    this.cancelIdleTimer()
    if (!this.manager) {
      this.start()
    }
    this.hub.sendHello(client)
    this.touchLastSeen()
    return client
  }

  detachClient(peer: Peer) {
    this.hub.removeClient(peer)
    this.activeClients = Math.max(0, this.activeClients - 1)
    if (this.activeClients === 0) {
      this.startIdleTimer()
    }
  }

  handleMessage(client: HubClient, message: ClientMessage) {
    this.hub.handleClientMessage(client, message)
  }

  getActiveClientCount() {
    return this.activeClients
  }

  start() {
    if (this.manager) return
    const manager = new TmuxManager({
      tmuxBin: TMUX_BIN,
      socketName: TMUX_SOCKET,
      targetSession: this.tmuxSession,
      onStdoutLine: (line) => this.hub.handleTmuxLine(line),
      onConnected: () => {
        this.setObservedStatus('running', null)
        this.hub.broadcastSessionStatus('running')
        this.startInitialStateSync()
      },
      onDisconnect: (error) => {
        this.clearStateSyncTimer()
        if (error instanceof MissingSessionError) {
          this.setObservedStatus('missing', error.message)
          this.hub.broadcastSessionStatus('missing', error.message, error.message)
          this.shutdownControlClient()
          return
        }
        this.setObservedStatus('disconnected', error?.message || null)
        this.hub.broadcastSessionStatus(
          'disconnected',
          error?.message || undefined,
          error?.message || undefined
        )
      }
    })
    this.manager = manager
    manager.start()
  }

  async shutdownControlClient() {
    this.clearStateSyncTimer()
    if (!this.manager) return
    await this.manager.shutdown()
    this.manager = null
    if (this.observedStatus === 'running') {
      this.setObservedStatus('disconnected', null)
    }
  }

  shutdown() {
    this.clearStateSyncTimer()
    this.hub.shutdown()
  }

  private startInitialStateSync() {
    this.clearStateSyncTimer()

    let attempts = 0
    const sync = () => {
      if (!this.manager) return
      this.hub.requestStateSync()
      attempts += 1
      if (attempts >= INITIAL_STATE_SYNC_ATTEMPTS) {
        this.stateSyncTimer = null
        return
      }
      this.stateSyncTimer = setTimeout(sync, INITIAL_STATE_SYNC_DELAY_MS * attempts)
    }

    sync()
  }

  private clearStateSyncTimer() {
    if (!this.stateSyncTimer) return
    clearTimeout(this.stateSyncTimer)
    this.stateSyncTimer = null
  }

  private startIdleTimer() {
    if (this.idleTimer) return
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null
      this.shutdownControlClient()
    }, IDLE_TIMEOUT_MS)
  }

  private cancelIdleTimer() {
    if (!this.idleTimer) return
    clearTimeout(this.idleTimer)
    this.idleTimer = null
  }

  private setObservedStatus(status: string, lastError: string | null) {
    this.observedStatus = status
    const db = getDb()
    db.update(sessions)
      .set({ observedStatus: status, lastError, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(sessions.id, this.sessionId))
      .run()
  }

  private touchLastSeen() {
    const db = getDb()
    db.update(sessions)
      .set({ lastSeenAt: Math.floor(Date.now() / 1000) })
      .where(eq(sessions.id, this.sessionId))
      .run()
  }
}
