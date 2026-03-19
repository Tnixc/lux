import type { Peer } from 'crossws'
import { decodeEscapedValue } from './escape'
import { StreamParser } from './stream-parser'
import type { Command, Notification, ParseError } from './types'
import { PaneModel, type StatePayload } from './model'
import { validateCommand } from './policy'

const MODEL_FORMAT =
  '__LUX___pane\t#{session_name}\t#{pane_id}\t#{window_id}\t#{pane_index}\t#{pane_active}\t#{pane_left}\t#{pane_top}\t#{pane_width}\t#{pane_height}\t#{pane_current_command}\t#{pane_title}\t#{window_index}\t#{window_name}'

const SAFE_TOKEN = /^[A-Za-z0-9_@%:./+-]+$/
const TMUX_HEX_INPUT_CHUNK_SIZE = 128

export interface ClientHello {
  t: 'hello'
  protocol: number
  renderer: 'xterm' | 'ghostty'
  cols: number
  rows: number
  wantSnapshot: boolean
}

export type ClientMessage =
  | ClientHello
  | { t: 'input'; paneId: string; data: string }
  | { t: 'resize'; cols: number; rows: number }
  | { t: 'focus_pane'; paneId: string }
  | { t: 'capture'; requestId: string; paneId: string }
  | { t: 'refresh_state'; requestId: string }
  | { t: 'ping'; ts: number }

export type ServerMessage =
  | {
      t: 'hello'
      protocol: number
      session: {
        id: string
        name: string
        observedStatus: string
        tmuxSession: string
      }
      control: { interactive: boolean; isController: boolean }
    }
  | { t: 'state'; state: StatePayload }
  | { t: 'pane_output'; paneId: string; data: string }
  | {
      t: 'pane_snapshot'
      paneId: string
      requestId?: string
      data: string
      cursor?: { x: number; y: number }
    }
  | { t: 'pane_cursor'; paneId: string; x: number; y: number }
  | { t: 'notification'; name: string; args: string[]; text: string }
  | { t: 'session_status'; observedStatus: string; reason?: string; lastError?: string | null }
  | { t: 'cmd_result'; requestId: string; ok: boolean; error?: string }
  | { t: 'error'; code: string; message: string }
  | { t: 'pong'; ts: number }

interface PendingCommand {
  name: string
  paneId?: string
  requestId?: string
  emitSnapshot?: boolean
  expectCursor?: boolean
}

type PendingCommandInput = Omit<PendingCommand, 'name'>

export interface HubClient {
  peer: Peer
  isController: boolean
  hello?: ClientHello
}

export class SessionHub {
  private clients = new Set<HubClient>()
  private controller: HubClient | null = null
  private parser = new StreamParser()
  private model = new PaneModel()
  private pending: PendingCommand[] = []
  private outputCarry = new Map<string, Uint8Array>()
  private cursorByPane = new Map<string, { x: number; y: number }>()
  private refreshTimer: NodeJS.Timeout | null = null

  constructor(
    private readonly sessionId: string,
    private readonly tmuxSession: string,
    private readonly sessionName: string,
    private readonly sendTmux: (line: string) => void,
    private readonly getObservedStatus: () => string
  ) {
    this.parser.onEvent((event) => this.handleTmuxEvent(event))
  }

  addClient(peer: Peer) {
    const isController = !this.controller
    const client: HubClient = { peer, isController }
    this.clients.add(client)
    if (isController) {
      this.controller = client
    }
    return client
  }

  removeClient(peer: Peer) {
    for (const client of this.clients) {
      if (client.peer === peer) {
        this.clients.delete(client)
        if (this.controller === client) {
          this.controller = null
          const nextController = this.clients.values().next().value as HubClient | undefined
          if (nextController) {
            nextController.isController = true
            this.controller = nextController
            this.sendHello(nextController)
          }
        }
        break
      }
    }
  }

  handleClientMessage(client: HubClient, message: ClientMessage) {
    switch (message.t) {
      case 'hello':
        client.hello = message
        this.sendResize(message.cols, message.rows)
        const state = this.filteredState()
        this.sendToClient(client, { t: 'state', state })
        if (message.wantSnapshot) {
          this.requestSnapshot(state.activePaneId)
        }
        return
      case 'input':
        if (!this.validatePane(message.paneId)) return
        this.sendInput(message.paneId, message.data)
        return
      case 'resize':
        this.sendResize(message.cols, message.rows)
        return
      case 'focus_pane':
        if (!this.validatePane(message.paneId)) return
        this.sendTmuxCommand(['select-pane', '-t', message.paneId])
        return
      case 'capture':
        if (!this.validatePane(message.paneId)) return
        this.sendTmuxCommand(['capture-pane', '-t', message.paneId, '-p', '-e'], {
          requestId: message.requestId,
          paneId: message.paneId,
          emitSnapshot: true
        })
        this.sendTmuxCommand(
          [
            'display-message',
            '-p',
            '-t',
            message.paneId,
            '__LUX_CURSOR\t#{pane_cursor_x}\t#{pane_cursor_y}'
          ],
          { paneId: message.paneId, expectCursor: true }
        )
        return
      case 'refresh_state':
        this.requestStateSync(message.requestId)
        return
      case 'ping':
        this.sendToClient(client, { t: 'pong', ts: message.ts })
        return
    }
  }

  sendHello(client: HubClient) {
    this.sendToClient(client, {
      t: 'hello',
      protocol: 1,
      session: {
        id: this.sessionId,
        name: this.sessionName,
        observedStatus: this.getObservedStatus(),
        tmuxSession: this.tmuxSession
      },
      control: {
        interactive: this.getObservedStatus() === 'running',
        isController: client.isController
      }
    })
  }

  broadcastSessionStatus(status: string, reason?: string | null, lastError?: string | null) {
    this.broadcast({
      t: 'session_status',
      observedStatus: status,
      reason: reason || undefined,
      lastError: lastError ?? undefined
    })
  }

  broadcastState() {
    this.broadcast({ t: 'state', state: this.filteredState() })
  }

  handleTmuxLine(line: string) {
    this.parser.feedLine(line)
  }

  private filteredState(): StatePayload {
    const snapshot = this.model.snapshot()
    const panes = snapshot.panes.filter((pane) => pane.sessionName === this.tmuxSession)
    const windowIds = new Set(panes.map((pane) => pane.windowId))
    const windows = snapshot.windows.filter((window) => windowIds.has(window.id))
    const activePaneId = panes.find((pane) => pane.active)?.paneId || null
    return { panes, windows, activePaneId }
  }

  requestStateSync(requestId?: string) {
    this.sendTmuxCommand(['list-panes', '-a', '-F', MODEL_FORMAT], { requestId })
  }

  shutdown() {
    this.parser.close()
    if (this.refreshTimer) {
      clearTimeout(this.refreshTimer)
      this.refreshTimer = null
    }
    this.clients.clear()
    this.controller = null
  }

  private sendResize(cols: number, rows: number) {
    if (cols <= 0 || rows <= 0) return
    this.sendTmuxCommand(['refresh-client', '-C', `${cols}x${rows}`])
  }

  private sendInput(paneId: string, data: string) {
    if (!data) return

    const bytes = Buffer.from(data, 'utf8')
    if (!bytes.length) return

    for (let offset = 0; offset < bytes.length; offset += TMUX_HEX_INPUT_CHUNK_SIZE) {
      const chunk = bytes.subarray(offset, offset + TMUX_HEX_INPUT_CHUNK_SIZE)
      const hexKeys = Array.from(chunk, (byte) => byte.toString(16).padStart(2, '0'))
      this.sendTmuxCommand(['send-keys', '-t', paneId, '-H', ...hexKeys])
    }
  }

  private requestSnapshot(paneId: string | null) {
    if (!paneId) return
    this.sendTmuxCommand(['capture-pane', '-t', paneId, '-p', '-e'], {
      paneId,
      emitSnapshot: true
    })
    this.sendTmuxCommand(
      ['display-message', '-p', '-t', paneId, '__LUX_CURSOR\t#{pane_cursor_x}\t#{pane_cursor_y}'],
      { paneId, expectCursor: true }
    )
  }

  private sendTmuxCommand(argv: string[], pending?: PendingCommandInput) {
    try {
      const line = encodeArgvCommand(argv)
      validateCommand(argv[0] ?? '')
      this.sendTmux(line)
      if (pending) {
        this.pending.push({ name: argv[0], ...pending })
      } else if (argv.length > 0) {
        this.pending.push({ name: argv[0] })
      }
    } catch (err) {
      this.broadcast({
        t: 'error',
        code: 'tmux_unavailable',
        message: (err as Error).message
      })
    }
  }

  private handleTmuxEvent(event: Command | Notification | ParseError) {
    if ('output' in event) {
      const pending = this.pending.shift()
      if (pending?.requestId) {
        this.broadcast({
          t: 'cmd_result',
          requestId: pending.requestId,
          ok: event.success,
          error: event.success ? undefined : 'tmux_command_failed'
        })
      }

      if (event.output.length > 0) {
        const changed = this.model.applyOutputLines(event.output)
        if (changed) {
          this.broadcastState()
        }
      }

      if (pending?.emitSnapshot && pending.paneId) {
        const cursor = this.cursorByPane.get(pending.paneId)
        this.broadcast({
          t: 'pane_snapshot',
          paneId: pending.paneId,
          requestId: pending.requestId,
          data: event.output.join('\n'),
          cursor: cursor ? { ...cursor } : undefined
        })
      }

      if (pending?.expectCursor && pending.paneId) {
        const cursor = parseCursor(event.output)
        if (cursor) {
          this.cursorByPane.set(pending.paneId, cursor)
          this.broadcast({ t: 'pane_cursor', paneId: pending.paneId, ...cursor })
        }
      }
      return
    }

    if ('name' in event) {
      if (event.name === 'output' || event.name === 'extended-output') {
        const paneId = event.args[0]
        if (!paneId) return
        const panes = this.filteredState().panes
        if (panes.length > 0 && !panes.some((pane) => pane.paneId === paneId)) return
        const decoded = this.decodePaneOutput(paneId, event.value)
        if (!decoded) return
        this.broadcast({ t: 'pane_output', paneId, data: decoded })
        return
      }

      if (['session-changed', 'window-renamed', 'exit'].includes(event.name)) {
        this.broadcast({
          t: 'notification',
          name: event.name,
          args: event.args,
          text: event.text
        })
      }

      if (requiresRefresh(event.name)) {
        this.scheduleStateRefresh()
      }
      return
    }

    if ('message' in event) {
      this.broadcast({ t: 'error', code: 'parse_error', message: event.message })
    }
  }

  private scheduleStateRefresh() {
    if (this.refreshTimer) return
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = null
      try {
        this.requestStateSync()
      } catch {
        // ignore
      }
    }, 120)
  }

  private decodePaneOutput(paneId: string, value: string) {
    let raw = Buffer.from(decodeEscapedValue(value), 'binary')
    const carry = this.outputCarry.get(paneId)
    if (carry?.length) {
      raw = Buffer.concat([carry, raw])
    }
    const [decoded, remainder] = splitUtf8(raw)
    if (remainder.length) {
      this.outputCarry.set(paneId, remainder)
    } else {
      this.outputCarry.delete(paneId)
    }
    return decoded.toString('utf8')
  }

  private validatePane(paneId: string) {
    const panes = this.filteredState().panes
    if (panes.length === 0) {
      return true
    }
    const pane = panes.find((p) => p.paneId === paneId)
    if (!pane) {
      this.broadcast({ t: 'error', code: 'pane_not_found', message: 'pane not found' })
      return false
    }
    return true
  }

  private sendToClient(client: HubClient, message: ServerMessage) {
    client.peer.send(JSON.stringify(message))
  }

  private broadcast(message: ServerMessage) {
    const payload = JSON.stringify(message)
    for (const client of this.clients) {
      client.peer.send(payload)
    }
  }
}

function encodeArgvCommand(argv: string[]) {
  if (!argv.length) throw new Error('argv cannot be empty')
  const cmd = argv[0].trim().toLowerCase()
  if (!SAFE_TOKEN.test(cmd)) throw new Error('invalid command name')
  const parts = [cmd]
  for (const arg of argv.slice(1)) {
    parts.push(quoteArg(arg))
  }
  return parts.join(' ')
}

function quoteArg(arg: string) {
  if (!arg) return "''"
  if (SAFE_TOKEN.test(arg)) return arg
  return `'${arg.replace(/'/g, "'\\''")}'`
}

function parseCursor(lines: string[]) {
  if (!lines.length) return null
  const parts = lines[0].trim().split('\t')
  if (parts.length !== 3 || parts[0] !== '__LUX_CURSOR') return null
  const x = Number.parseInt(parts[1] ?? '0', 10)
  const y = Number.parseInt(parts[2] ?? '0', 10)
  if (Number.isNaN(x) || Number.isNaN(y)) return null
  return { x, y }
}

function splitUtf8(raw: Buffer): [Buffer, Buffer] {
  if (raw.length === 0) return [Buffer.alloc(0), Buffer.alloc(0)]
  if (isValidUtf8(raw)) {
    return [raw, Buffer.alloc(0)]
  }
  for (let cut = 1; cut <= 3 && cut <= raw.length; cut += 1) {
    const prefix = raw.slice(0, raw.length - cut)
    if (isValidUtf8(prefix)) {
      return [prefix, raw.slice(raw.length - cut)]
    }
  }
  const fallback = Buffer.from(raw.toString('utf8'), 'utf8')
  return [fallback, Buffer.alloc(0)]
}

function isValidUtf8(buffer: Buffer) {
  const decoded = buffer.toString('utf8')
  return Buffer.from(decoded, 'utf8').equals(buffer)
}

function requiresRefresh(name: string) {
  if (
    name === 'layout-change' ||
    name === 'sessions-changed' ||
    name === 'session-changed' ||
    name === 'client-session-changed'
  ) {
    return true
  }
  return name.startsWith('window-') || name.startsWith('pane-')
}
