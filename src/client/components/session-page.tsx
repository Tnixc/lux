import { useEffect, useRef, useCallback, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Square,
  Play,
  Trash2,
  ArrowLeft,
  AlertCircle,
  Terminal as TerminalIcon
} from 'lucide-react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { cn } from '../lib/utils'
import { useSession, useStopSession, useRestartSession, useDeleteSession } from '../lib/api'
import { useTabContext } from '../contexts/tabs'
import { Button } from './ui/button'
import '@xterm/xterm/css/xterm.css'

const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_DELAY = 2000
const VIEWPORT_RECALC_SETTLE_MS = 140

function cssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function resolveCssColor(name: string, fallback: string): string {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return fallback
  }

  const raw = cssVar(name, fallback)
  const probe = document.createElement('span')
  probe.style.color = raw
  probe.style.position = 'absolute'
  probe.style.opacity = '0'
  probe.style.pointerEvents = 'none'
  document.body.appendChild(probe)
  const resolved = getComputedStyle(probe).color
  probe.remove()
  return resolved || raw || fallback
}

function createTerminalTheme() {
  return {
    background: resolveCssColor('--background', '#111111'),
    foreground: resolveCssColor('--foreground', '#e5e7eb'),
    cursor: resolveCssColor('--foreground', '#e5e7eb'),
    cursorAccent: resolveCssColor('--background', '#111111'),
    selectionBackground: resolveCssColor('--accent', '#334155')
  }
}

function getTerminalFontSize() {
  if (typeof window === 'undefined') return 14
  return window.matchMedia('(max-width: 768px)').matches ? 13 : 14
}

function normalizeSnapshotData(raw: string): string {
  const lines = raw.split('\n')
  while (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop()
  }
  return lines.join('\r\n')
}

function statusColor(status: string): string {
  switch (status) {
    case 'running':
      return 'bg-green-500'
    case 'starting':
      return 'bg-yellow-500'
    case 'stopped':
      return 'bg-gray-500'
    case 'error':
      return 'bg-red-500'
    case 'missing':
      return 'bg-orange-500'
    case 'disconnected':
      return 'bg-yellow-500'
    default:
      return 'bg-gray-500'
  }
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1)
}

export function SessionPage() {
  const { sessionId, projectId } = useParams<{
    sessionId: string
    projectId: string
  }>()
  const navigate = useNavigate()
  const { updateSessionStatus } = useTabContext()

  const { data: session, refetch: refetchSession } = useSession(sessionId!)
  const stopSession = useStopSession()
  const restartSession = useRestartSession()
  const deleteSession = useDeleteSession()

  const terminalRef = useRef<HTMLDivElement>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const wsRef = useRef<WebSocket | null>(null)
  const primaryPaneIdRef = useRef<string | null>(null)
  const lastSnapshotPaneRef = useRef<string | null>(null)
  const snapshotRequestIdRef = useRef(0)
  const reconnectAttemptRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [connected, setConnected] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  // Keep primaryPaneId in sync with session data
  useEffect(() => {
    if (session?.primaryPaneId) {
      primaryPaneIdRef.current = session.primaryPaneId
    }
  }, [session?.primaryPaneId])

  const wsSend = useCallback((msg: object) => {
    const ws = wsRef.current
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    }
  }, [])

  const fitAndSyncViewport = useCallback(() => {
    const fitAddon = fitAddonRef.current
    const term = termRef.current
    if (!fitAddon || !term) return

    fitAddon.fit()
    wsSend({
      t: 'resize',
      cols: term.cols,
      rows: term.rows,
      pixelWidth: term.element?.clientWidth,
      pixelHeight: term.element?.clientHeight
    })
  }, [wsSend])

  const requestSnapshot = useCallback(
    (paneId: string) => {
      snapshotRequestIdRef.current += 1
      wsSend({
        t: 'capture',
        paneId,
        requestId: `snapshot-${snapshotRequestIdRef.current}`
      })
    },
    [wsSend]
  )

  const connect = useCallback(() => {
    if (!sessionId) return

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const ws = new WebSocket(`${protocol}//${window.location.host}/api/sessions/${sessionId}/ws`)
    wsRef.current = ws

    ws.onopen = () => {
      setConnected(true)
      reconnectAttemptRef.current = 0
      lastSnapshotPaneRef.current = null

      const term = termRef.current
      if (term) {
        ws.send(
          JSON.stringify({
            t: 'hello',
            protocol: 1,
            renderer: 'xterm',
            cols: term.cols,
            rows: term.rows,
            wantSnapshot: true
          })
        )
      }

      ws.send(
        JSON.stringify({
          t: 'refresh_state',
          requestId: 'initial-state'
        })
      )

      requestAnimationFrame(() => {
        fitAndSyncViewport()
      })
    }

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string)
        const term = termRef.current

        switch (msg.t) {
          case 'hello':
            break
          case 'pane_output':
            term?.write(msg.data)
            break
          case 'pane_snapshot': {
            if (msg.paneId) {
              lastSnapshotPaneRef.current = msg.paneId
            }
            term?.reset()
            term?.write(normalizeSnapshotData(msg.data ?? ''))
            break
          }
          case 'session_status':
            if (msg.observedStatus) {
              updateSessionStatus(sessionId, msg.observedStatus)
              refetchSession()
            }
            break
          case 'state': {
            const activePaneId = msg.state?.activePaneId
            if (activePaneId) {
              primaryPaneIdRef.current = activePaneId
              if (lastSnapshotPaneRef.current !== activePaneId) {
                lastSnapshotPaneRef.current = activePaneId
                requestSnapshot(activePaneId)
              }
            }
            break
          }
          case 'error':
            break
          case 'cmd_result':
            break
          case 'pong':
            break
        }
      } catch {
        // ignore malformed messages
      }
    }

    ws.onclose = () => {
      setConnected(false)
      scheduleReconnect()
    }

    ws.onerror = () => {
      ws.close()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, updateSessionStatus, refetchSession, requestSnapshot, fitAndSyncViewport])

  const scheduleReconnect = useCallback(() => {
    if (reconnectAttemptRef.current >= MAX_RECONNECT_ATTEMPTS) return
    reconnectAttemptRef.current += 1
    reconnectTimerRef.current = setTimeout(() => {
      connect()
    }, RECONNECT_DELAY)
  }, [connect])

  useEffect(() => {
    if (!terminalRef.current || !sessionId) return

    const term = new Terminal({
      fontFamily: cssVar('--font-mono', 'monospace'),
      fontSize: getTerminalFontSize(),
      cursorBlink: true,
      allowTransparency: true,
      theme: createTerminalTheme()
    })
    termRef.current = term

    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    term.loadAddon(fitAddon)

    term.open(terminalRef.current)

    // Try WebGL addon on desktop-class displays, fallback to canvas elsewhere.
    const shouldUseWebgl =
      typeof window !== 'undefined' &&
      !window.matchMedia('(max-width: 768px)').matches &&
      window.devicePixelRatio <= 2
    if (shouldUseWebgl) {
      try {
        const webglAddon = new WebglAddon()
        webglAddon.onContextLoss(() => {
          webglAddon.dispose()
        })
        term.loadAddon(webglAddon)
      } catch {
        // canvas renderer is used by default
      }
    }

    let resizeFrame: number | null = null
    let settleTimer: ReturnType<typeof setTimeout> | null = null

    const syncTerminalLayout = (refreshSnapshot = false) => {
      term.options.fontSize = getTerminalFontSize()
      fitAndSyncViewport()

      if (refreshSnapshot) {
        const paneId = primaryPaneIdRef.current
        if (paneId) {
          requestSnapshot(paneId)
        }
      }
    }

    const scheduleLayoutRecalc = (refreshSnapshot = false) => {
      if (resizeFrame !== null) {
        cancelAnimationFrame(resizeFrame)
      }
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = null
        syncTerminalLayout(false)
      })

      if (settleTimer) {
        clearTimeout(settleTimer)
      }
      settleTimer = setTimeout(() => {
        settleTimer = null
        syncTerminalLayout(refreshSnapshot)
      }, VIEWPORT_RECALC_SETTLE_MS)
    }

    syncTerminalLayout(false)

    const handleContainerPointerDown = () => {
      term.focus()
      scheduleLayoutRecalc(true)
    }
    terminalRef.current.addEventListener('pointerdown', handleContainerPointerDown)
    term.focus()

    // Input handler
    term.onData((data) => {
      const paneId = primaryPaneIdRef.current
      if (!paneId) return
      wsSend({
        t: 'input',
        data,
        paneId
      })
    })

    // Resize handler
    term.onResize(({ cols, rows }) => {
      wsSend({
        t: 'resize',
        cols,
        rows,
        pixelWidth: term.element?.clientWidth,
        pixelHeight: term.element?.clientHeight
      })
    })

    // ResizeObserver for container
    const container = terminalRef.current
    const resizeObserver = new ResizeObserver(() => {
      scheduleLayoutRecalc(false)
    })
    resizeObserver.observe(container)

    const handleViewportResize = () => {
      scheduleLayoutRecalc(true)
    }
    const handleViewportScroll = () => {
      scheduleLayoutRecalc(true)
    }
    const handleInputFocusChange = () => {
      scheduleLayoutRecalc(true)
    }

    const helperTextarea = terminalRef.current.querySelector('.xterm-helper-textarea')
    if (helperTextarea instanceof HTMLTextAreaElement) {
      helperTextarea.addEventListener('focus', handleInputFocusChange)
      helperTextarea.addEventListener('blur', handleInputFocusChange)
    }

    window.addEventListener('resize', handleViewportResize)
    window.addEventListener('orientationchange', handleViewportResize)
    window.visualViewport?.addEventListener('resize', handleViewportResize)
    window.visualViewport?.addEventListener('scroll', handleViewportScroll)

    // Connect WebSocket
    connect()

    return () => {
      resizeObserver.disconnect()
      if (resizeFrame !== null) {
        cancelAnimationFrame(resizeFrame)
      }
      if (settleTimer) {
        clearTimeout(settleTimer)
      }
      if (helperTextarea instanceof HTMLTextAreaElement) {
        helperTextarea.removeEventListener('focus', handleInputFocusChange)
        helperTextarea.removeEventListener('blur', handleInputFocusChange)
      }
      window.removeEventListener('resize', handleViewportResize)
      window.removeEventListener('orientationchange', handleViewportResize)
      window.visualViewport?.removeEventListener('resize', handleViewportResize)
      window.visualViewport?.removeEventListener('scroll', handleViewportScroll)
      container.removeEventListener('pointerdown', handleContainerPointerDown)
      lastSnapshotPaneRef.current = null
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current)
      }
      if (wsRef.current) {
        wsRef.current.onclose = null
        wsRef.current.close()
      }
      term.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const handleStop = useCallback(() => {
    if (sessionId) stopSession.mutate(sessionId)
  }, [sessionId, stopSession])

  const handleRestart = useCallback(() => {
    if (sessionId) restartSession.mutate(sessionId)
  }, [sessionId, restartSession])

  const handleDelete = useCallback(() => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    if (sessionId) {
      deleteSession.mutate(sessionId, {
        onSuccess: () => {
          navigate(`/projects/${projectId}`)
        }
      })
    }
  }, [confirmDelete, sessionId, projectId, deleteSession, navigate])

  // Reset confirm state on blur
  useEffect(() => {
    if (!confirmDelete) return
    const timer = setTimeout(() => setConfirmDelete(false), 3000)
    return () => clearTimeout(timer)
  }, [confirmDelete])

  const observedStatus = session?.observedStatus ?? 'unknown'
  const canStop =
    observedStatus === 'running' ||
    observedStatus === 'starting' ||
    observedStatus === 'disconnected'
  const canRestart =
    observedStatus === 'stopped' || observedStatus === 'error' || observedStatus === 'missing'

  return (
    <div className='flex flex-col h-full bg-background'>
      {/* Header */}
      <div className='flex items-center gap-3 border-b border-border px-4 py-2 shrink-0 bg-card/30'>
        <Button variant='ghost' size='icon-sm' onClick={() => navigate(`/projects/${projectId}`)}>
          <ArrowLeft className='w-4 h-4' />
        </Button>

        <div className='flex items-center gap-2 min-w-0'>
          <TerminalIcon className='w-4 h-4 text-muted-foreground shrink-0' />
          <span className='font-medium truncate'>{session?.name ?? 'Session'}</span>
        </div>

        {session?.agentCli && (
          <span className='shrink-0 inline-flex items-center px-2 py-0.5 text-[11px] font-medium rounded-full bg-muted text-muted-foreground border border-border'>
            {session.agentCli}
          </span>
        )}

        <div className='flex items-center gap-1.5 shrink-0'>
          <span className={cn('w-2 h-2 rounded-full', statusColor(observedStatus))} />
          <span className='text-xs text-muted-foreground'>{statusLabel(observedStatus)}</span>
        </div>

        {session?.lastError && (
          <div className='flex items-center gap-1 text-xs text-red-500 min-w-0'>
            <AlertCircle className='w-3.5 h-3.5 shrink-0' />
            <span className='truncate'>{session.lastError}</span>
          </div>
        )}

        <div className='flex-1' />

        {/* Actions */}
        <div className='flex items-center gap-1.5 shrink-0'>
          {canStop && (
            <Button variant='ghost' size='sm' onClick={handleStop} disabled={stopSession.isPending}>
              <Square className='w-3.5 h-3.5' />
              Stop
            </Button>
          )}
          {canRestart && (
            <Button
              variant='ghost'
              size='sm'
              onClick={handleRestart}
              disabled={restartSession.isPending}
            >
              <Play className='w-3.5 h-3.5' />
              Restart
            </Button>
          )}
          <Button
            variant={confirmDelete ? 'destructive' : 'ghost'}
            size='sm'
            onClick={handleDelete}
            disabled={deleteSession.isPending}
          >
            <Trash2 className='w-3.5 h-3.5' />
            {confirmDelete ? 'Confirm?' : 'Delete'}
          </Button>
        </div>
      </div>

      {/* Terminal */}
      <div className='relative flex-1 min-h-0'>
        <div ref={terminalRef} className='lux-terminal absolute inset-0 p-1 bg-background' />

        {/* Disconnected overlay */}
        {!connected && (
          <div className='absolute inset-0 flex items-center justify-center bg-black/60 z-10'>
            <div className='flex items-center gap-2 text-sm text-muted-foreground'>
              <AlertCircle className='w-4 h-4' />
              Disconnected — Reconnecting...
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
