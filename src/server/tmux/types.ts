export interface BlockHeader {
  epochSeconds: number
  commandId: number
  flags: number
}

export interface Command {
  header: BlockHeader
  end: BlockHeader
  success: boolean
  output: string[]
}

export interface Notification {
  name: string
  raw: string
  args: string[]
  text: string
  value: string
}

export interface ParseError {
  line: string
  message: string
}

export type StreamEvent = Command | Notification | ParseError
