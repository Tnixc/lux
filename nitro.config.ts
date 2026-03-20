import { defineNitroConfig } from 'nitro/config'
import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const isVitest =
  process.env.VITEST === 'true' || process.env.VITEST === '1' || process.env.NODE_ENV === 'test'

export default defineNitroConfig({
  serverDir: './src/server',
  features: {
    websocket: !isVitest
  },
  hooks: {
    compiled() {
      // Copy node-pty native binary to output since Nitro's tracer doesn't handle .node files
      const src = resolve('node_modules/node-pty/build/Release/pty.node')
      const dest = resolve('.output/server/node_modules/node-pty/build/Release/pty.node')
      if (existsSync(src)) {
        cpSync(src, dest, { recursive: true })
      }
    }
  }
})
