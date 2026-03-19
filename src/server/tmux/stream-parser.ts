import type { Command, StreamEvent } from './types'
import { Parser } from './parser'

export class StreamParser {
  private events: StreamEvent[] = []
  private listeners: Array<(event: StreamEvent) => void> = []
  private closed = false
  private current: Command | null = null
  private parser: Parser

  constructor() {
    this.parser = new Parser({
      onCommandBegin: (header) => {
        this.current = { header, end: header, success: true, output: [] }
      },
      onCommandLine: (_, line) => {
        if (!this.current) return
        this.current.output.push(line)
      },
      onCommandEnd: (begin, end, success) => {
        if (!this.current) {
          this.emit({ line: '', message: 'command end without active command' } as StreamEvent)
          return
        }
        this.current.header = begin
        this.current.end = end
        this.current.success = success
        this.emit(this.current)
        this.current = null
      },
      onNotification: (notification) => {
        this.emit(notification)
      },
      onError: (error) => {
        this.emit(error)
      }
    })
  }

  onEvent(listener: (event: StreamEvent) => void) {
    this.listeners.push(listener)
  }

  feedLine(line: string) {
    if (this.closed) return
    this.parser.feedLine(line)
  }

  close() {
    if (this.closed) return
    this.parser.finish()
    this.closed = true
  }

  private emit(event: StreamEvent) {
    if (this.closed) return
    this.events.push(event)
    for (const listener of this.listeners) {
      listener(event)
    }
  }
}
