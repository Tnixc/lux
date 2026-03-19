const ALLOWED_COMMANDS = new Set([
  'send-keys',
  'refresh-client',
  'list-panes',
  'capture-pane',
  'display-message',
  'select-pane',
  'resize-pane'
])

export function validateCommand(command: string) {
  if (!command) {
    throw new Error('empty command')
  }
  const lower = command.toLowerCase()
  if (!ALLOWED_COMMANDS.has(lower)) {
    throw new Error(`blocked command: ${lower}`)
  }
}

export function getAllowedCommands() {
  return new Set(ALLOWED_COMMANDS)
}
