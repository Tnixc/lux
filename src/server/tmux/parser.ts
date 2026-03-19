import type { BlockHeader, Notification, ParseError } from './types'

export interface ParserCallbacks {
  onCommandBegin?: (header: BlockHeader) => void
  onCommandLine?: (header: BlockHeader, line: string) => void
  onCommandEnd?: (begin: BlockHeader, end: BlockHeader, success: boolean) => void
  onNotification?: (notification: Notification) => void
  onError?: (error: ParseError) => void
}

export class Parser {
  private current: BlockHeader | null = null
  constructor(private readonly cb: ParserCallbacks) {}

  feedLine(line: string) {
    if (this.current) {
      const end = parseEndLine(line)
      if (end) {
        if (end.error) {
          this.emitError({ line, message: end.error })
          return
        }
        this.finishBlock(end.header!, end.success!, line)
        return
      }
      if (malformedControlBoundary(line)) {
        this.emitError({ line, message: 'malformed control boundary' })
        return
      }
      this.cb.onCommandLine?.(this.current, line)
      return
    }

    const begin = parseBeginLine(line)
    if (begin) {
      if (begin.error) {
        this.emitError({ line, message: begin.error })
        return
      }
      this.current = begin.header!
      this.cb.onCommandBegin?.(begin.header!)
      return
    }

    const end = parseEndLine(line)
    if (end) {
      if (end.error) {
        this.emitError({ line, message: end.error })
        return
      }
      this.emitError({ line, message: 'end/error without begin' })
      return
    }

    if (line.startsWith('%')) {
      const notification = parseNotification(line)
      if (notification.error) {
        this.emitError({ line, message: notification.error })
        return
      }
      this.cb.onNotification?.(notification.notification!)
      return
    }

    this.emitError({ line, message: 'unexpected line outside command block' })
  }

  finish() {
    if (this.current) {
      this.emitError({ line: '', message: 'unterminated command block at end of stream' })
      this.current = null
    }
  }

  private finishBlock(end: BlockHeader, success: boolean, raw: string) {
    if (!this.current) {
      this.emitError({ line: raw, message: 'internal: missing active block' })
      return
    }
    const begin = this.current
    this.current = null
    if (!headersEqual(begin, end)) {
      this.emitError({
        line: raw,
        message: `mismatched block header begin=${JSON.stringify(begin)} end=${JSON.stringify(end)}`
      })
    }
    this.cb.onCommandEnd?.(begin, end, success)
  }

  private emitError(error: ParseError) {
    this.cb.onError?.(error)
  }
}

function parseBeginLine(line: string) {
  if (!line.startsWith('%begin')) return null
  if (!line.startsWith('%begin ')) return { error: 'invalid %begin line' } as const
  const header = parseHeader(line.slice(7))
  if (!header) return { error: 'invalid %begin header' } as const
  return { header } as const
}

function parseEndLine(line: string) {
  if (line.startsWith('%end')) {
    if (!line.startsWith('%end ')) return { error: 'invalid %end line' } as const
    const header = parseHeader(line.slice(5))
    if (!header) return { error: 'invalid %end header' } as const
    return { header, success: true } as const
  }
  if (line.startsWith('%error')) {
    if (!line.startsWith('%error ')) return { error: 'invalid %error line' } as const
    const header = parseHeader(line.slice(7))
    if (!header) return { error: 'invalid %error header' } as const
    return { header, success: false } as const
  }
  return null
}

function parseHeader(raw: string): BlockHeader | null {
  const parts = raw.trim().split(/\s+/)
  if (parts.length !== 3) return null
  const epoch = Number.parseInt(parts[0], 10)
  const commandId = Number.parseInt(parts[1], 10)
  const flags = Number.parseInt(parts[2], 10)
  if (Number.isNaN(epoch) || Number.isNaN(commandId) || Number.isNaN(flags)) return null
  return { epochSeconds: epoch, commandId, flags }
}

function parseNotification(line: string) {
  if (!line.startsWith('%')) return { error: 'not a notification' } as const
  const [name, rest] = splitNameAndRest(line.slice(1))
  const notification: Notification = { name, raw: line, args: [], text: '', value: '' }

  switch (name) {
    case 'output': {
      const [paneId, value] = splitFirstTokenPreserve(rest)
      if (!paneId) return { error: 'output missing pane id' } as const
      notification.args = [paneId]
      notification.value = value
      break
    }
    case 'extended-output': {
      const [base, value] = splitByColon(rest)
      const fields = base.split(/\s+/).filter(Boolean)
      if (fields.length < 2) return { error: 'extended-output missing required fields' } as const
      notification.args = fields
      notification.value = value
      break
    }
    case 'subscription-changed': {
      const [base, value] = splitByColon(rest)
      const fields = base.split(/\s+/).filter(Boolean)
      if (fields.length < 5)
        return { error: 'subscription-changed missing required fields' } as const
      notification.args = fields
      notification.value = value
      break
    }
    case 'message':
    case 'config-error':
    case 'session-renamed':
    case 'exit': {
      notification.text = rest.trim()
      break
    }
    case 'client-session-changed': {
      const [a, b, tail] = takeTwoAndTail(rest)
      if (!a || !b) return { error: 'client-session-changed missing required fields' } as const
      notification.args = [a, b]
      notification.text = tail
      break
    }
    case 'session-changed':
    case 'window-renamed': {
      const [a, tail] = splitOnce(rest.trim(), ' ')
      if (!a) return { error: `${name} missing required fields` } as const
      notification.args = [a]
      notification.text = tail
      break
    }
    default: {
      notification.args = rest.split(/\s+/).filter(Boolean)
      break
    }
  }

  return { notification } as const
}

function splitOnce(value: string, sep: string) {
  const trimmed = value.trim()
  if (!trimmed) return ['', ''] as const
  const index = trimmed.indexOf(sep)
  if (index === -1) return [trimmed, ''] as const
  return [trimmed.slice(0, index), trimmed.slice(index + 1).trim()] as const
}

function splitNameAndRest(value: string) {
  if (!value) return ['', ''] as const
  const index = value.indexOf(' ')
  if (index === -1) return [value, ''] as const
  return [value.slice(0, index), value.slice(index + 1)]
}

function splitFirstTokenPreserve(value: string) {
  const trimmed = value.trimStart()
  if (!trimmed) return ['', ''] as const
  const index = trimmed.indexOf(' ')
  if (index === -1) return [trimmed, ''] as const
  return [trimmed.slice(0, index), trimmed.slice(index + 1)]
}

function splitByColon(value: string) {
  const idx = value.indexOf(':')
  if (idx === -1) return [value.trim(), ''] as const
  return [value.slice(0, idx).trim(), value.slice(idx + 1).trimStart()] as const
}

function takeTwoAndTail(value: string) {
  const [a, rest] = splitOnce(value.trim(), ' ')
  const [b, tail] = splitOnce(rest.trim(), ' ')
  return [a, b, tail] as const
}

function malformedControlBoundary(line: string) {
  return (
    (line.startsWith('%begin') && !line.startsWith('%begin ')) ||
    (line.startsWith('%end') && !line.startsWith('%end ')) ||
    (line.startsWith('%error') && !line.startsWith('%error '))
  )
}

function headersEqual(a: BlockHeader, b: BlockHeader) {
  return a.epochSeconds === b.epochSeconds && a.commandId === b.commandId && a.flags === b.flags
}
