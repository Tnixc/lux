export interface WindowPayload {
  id: string
  index: number
  name: string
}

export interface PanePayload {
  paneId: string
  windowId: string
  windowIndex: number
  windowName: string
  paneIndex: number
  active: boolean
  width: number
  height: number
  title: string
  sessionName: string
}

export interface StatePayload {
  windows: WindowPayload[]
  panes: PanePayload[]
  activePaneId: string | null
}

const MODEL_PREFIX = '__LUX__'

export class PaneModel {
  private windows = new Map<string, WindowPayload>()
  private panes = new Map<string, PanePayload>()
  private activePaneId: string | null = null

  reset() {
    this.windows.clear()
    this.panes.clear()
    this.activePaneId = null
  }

  applyOutputLines(lines: string[]) {
    const nextPanes = new Map<string, PanePayload>()
    let activePane: string | null = null
    for (const line of lines) {
      if (!line.startsWith(MODEL_PREFIX)) continue
      const parts = line.split('\t')
      if (parts.length < 12) continue
      const kind = parts[0].slice(MODEL_PREFIX.length + 1)
      if (kind !== 'pane') continue

      const sessionName = parts[1] ?? ''
      const paneId = parts[2] ?? ''
      const windowId = parts[3] ?? ''
      const paneIndex = Number.parseInt(parts[4] ?? '0', 10)
      const isActive = parts[5] === '1'
      const width = Number.parseInt(parts[8] ?? '0', 10)
      const height = Number.parseInt(parts[9] ?? '0', 10)
      const title = parts[11] ?? parts[10] ?? ''
      const windowIndex = Number.parseInt(parts[12] ?? '0', 10)
      const windowName = parts[13] ?? ''

      const payload: PanePayload = {
        paneId,
        windowId,
        windowIndex: Number.isNaN(windowIndex) ? 0 : windowIndex,
        windowName,
        paneIndex: Number.isNaN(paneIndex) ? 0 : paneIndex,
        active: isActive,
        width: Number.isNaN(width) ? 0 : width,
        height: Number.isNaN(height) ? 0 : height,
        title,
        sessionName
      }
      nextPanes.set(paneId, payload)
      if (isActive && !activePane) {
        activePane = paneId
      }
    }

    const panesChanged = !mapsEqual(this.panes, nextPanes)
    const windowsNext = windowsFromPanes(nextPanes)
    const windowsChanged = !mapsEqualWindows(this.windows, windowsNext)
    const activeChanged = this.activePaneId !== activePane

    if (panesChanged) {
      this.panes = nextPanes
    }
    if (windowsChanged) {
      this.windows = windowsNext
    }
    this.activePaneId = activePane
    return panesChanged || windowsChanged || activeChanged
  }

  snapshot(): StatePayload {
    const windows = Array.from(this.windows.values()).sort((a, b) => a.index - b.index)
    const panes = Array.from(this.panes.values()).sort((a, b) => {
      if (a.windowIndex !== b.windowIndex) return a.windowIndex - b.windowIndex
      if (a.windowId !== b.windowId) return a.windowId.localeCompare(b.windowId)
      if (a.paneIndex !== b.paneIndex) return a.paneIndex - b.paneIndex
      return a.paneId.localeCompare(b.paneId)
    })
    return { windows, panes, activePaneId: this.activePaneId }
  }
}

function mapsEqual(a: Map<string, PanePayload>, b: Map<string, PanePayload>) {
  if (a.size !== b.size) return false
  for (const [key, value] of a.entries()) {
    const other = b.get(key)
    if (!other) return false
    if (JSON.stringify(other) !== JSON.stringify(value)) return false
  }
  return true
}

function mapsEqualWindows(a: Map<string, WindowPayload>, b: Map<string, WindowPayload>) {
  if (a.size !== b.size) return false
  for (const [key, value] of a.entries()) {
    const other = b.get(key)
    if (!other) return false
    if (JSON.stringify(other) !== JSON.stringify(value)) return false
  }
  return true
}

function windowsFromPanes(panes: Map<string, PanePayload>) {
  const windows = new Map<string, WindowPayload>()
  for (const pane of panes.values()) {
    if (!pane.windowId) continue
    windows.set(pane.windowId, {
      id: pane.windowId,
      index: pane.windowIndex,
      name: pane.windowName
    })
  }
  return windows
}
