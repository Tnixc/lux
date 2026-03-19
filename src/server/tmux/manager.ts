import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { setTimeout as sleep } from 'node:timers/promises'
import type { IPty } from 'node-pty'
import { spawn } from 'node-pty'

const execFileAsync = promisify(execFile)

export interface ManagerConfig {
  tmuxBin: string
  socketName: string
  targetSession: string
  backoffBase?: number
  backoffMax?: number
  onStdoutLine?: (line: string) => void
  onConnected?: () => void
  onDisconnect?: (error: Error | null) => void
}

export class MissingSessionError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MissingSessionError'
  }
}

export class TmuxManager {
  private cfg: ManagerConfig
  private pty: IPty | null = null
  private running = false
  private loop: Promise<void> | null = null
  private stopping = false

  constructor(cfg: ManagerConfig) {
    this.cfg = {
      backoffBase: 500,
      backoffMax: 10000,
      ...cfg
    }
  }

  start() {
    if (this.loop) return
    this.stopping = false
    this.running = true
    this.loop = this.runLoop()
  }

  async shutdown() {
    this.stopping = true
    this.running = false
    if (this.pty) {
      this.pty.kill()
      this.pty = null
    }
    await this.loop
    this.loop = null
  }

  send(line: string) {
    if (!this.pty) {
      throw new Error('tmux control mode not ready')
    }
    this.pty.write(`${line}\n`)
  }

  private async runLoop() {
    let backoff = this.cfg.backoffBase ?? 500
    while (this.running && !this.stopping) {
      try {
        await this.ensureSession()
      } catch (err) {
        this.cfg.onDisconnect?.(err as Error)
        if (err instanceof MissingSessionError) {
          break
        }
        await sleep(backoff)
        backoff = Math.min(backoff * 2, this.cfg.backoffMax ?? 10000)
        continue
      }

      try {
        await this.runOnce()
      } catch (err) {
        if (this.stopping) break
        this.cfg.onDisconnect?.(err as Error)
        await sleep(backoff)
        backoff = Math.min(backoff * 2, this.cfg.backoffMax ?? 10000)
        continue
      }
    }
  }

  private async ensureSession() {
    const args = ['-L', this.cfg.socketName, 'has-session', '-t', this.cfg.targetSession]
    try {
      await execFileAsync(this.cfg.tmuxBin, args, { encoding: 'utf8' })
    } catch (err: unknown) {
      const stderr = (err as { stderr?: string }).stderr?.trim()
      throw new MissingSessionError(
        stderr ? `target session unavailable: ${stderr}` : 'target session unavailable'
      )
    }
  }

  private runOnce() {
    return new Promise<void>((resolve, reject) => {
      const args = [
        '-L',
        this.cfg.socketName,
        '-CC',
        'attach-session',
        '-t',
        this.cfg.targetSession
      ]
      const pty = spawn(this.cfg.tmuxBin, args, {
        name: 'xterm-256color',
        cols: 120,
        rows: 40
      })
      this.pty = pty
      this.cfg.onConnected?.()

      let buffer = ''
      pty.onData((data) => {
        buffer += data
        let idx = buffer.indexOf('\n')
        while (idx !== -1) {
          const line = buffer.slice(0, idx).replace(/\r$/, '')
          buffer = buffer.slice(idx + 1)
          this.cfg.onStdoutLine?.(line)
          idx = buffer.indexOf('\n')
        }
      })

      pty.onExit(({ exitCode, signal }) => {
        this.pty = null
        if (this.stopping) {
          resolve()
          return
        }
        reject(
          new Error(`tmux control client exited (${exitCode ?? 0}${signal ? `:${signal}` : ''})`)
        )
      })
    })
  }
}
