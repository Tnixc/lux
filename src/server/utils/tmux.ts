import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export const TMUX_BIN = process.env.LUX_TMUX_BIN || 'tmux'
export const TMUX_SOCKET = process.env.LUX_TMUX_SOCKET || 'lux-sessions'

export async function tmuxHasSession(sessionName: string) {
  try {
    await execFileAsync(TMUX_BIN, ['-L', TMUX_SOCKET, 'has-session', '-t', sessionName], {
      encoding: 'utf8'
    })
    return true
  } catch {
    return false
  }
}

export async function tmuxListSessions() {
  const { stdout } = await execFileAsync(
    TMUX_BIN,
    ['-L', TMUX_SOCKET, 'list-sessions', '-F', '#{session_name}'],
    { encoding: 'utf8' }
  )
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}

export async function tmuxKillSession(sessionName: string) {
  await execFileAsync(TMUX_BIN, ['-L', TMUX_SOCKET, 'kill-session', '-t', sessionName], {
    encoding: 'utf8'
  })
}

export async function tmuxNewSession(sessionName: string, cwd: string) {
  await execFileAsync(
    TMUX_BIN,
    ['-L', TMUX_SOCKET, 'new-session', '-d', '-s', sessionName, '-c', cwd],
    { encoding: 'utf8' }
  )
}

export async function tmuxSendKeys(sessionName: string, command: string) {
  await execFileAsync(
    TMUX_BIN,
    ['-L', TMUX_SOCKET, 'send-keys', '-t', sessionName, '-l', command],
    { encoding: 'utf8' }
  )
  await execFileAsync(TMUX_BIN, ['-L', TMUX_SOCKET, 'send-keys', '-t', sessionName, 'Enter'], {
    encoding: 'utf8'
  })
}

export async function tmuxListPanes(sessionName: string) {
  const { stdout } = await execFileAsync(
    TMUX_BIN,
    ['-L', TMUX_SOCKET, 'list-panes', '-t', sessionName, '-F', '#{pane_id}'],
    { encoding: 'utf8' }
  )
  return stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}
