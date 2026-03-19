import { defineNitroConfig } from 'nitro/config'
import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

export default defineNitroConfig({
  serverDir: './src/server',
  features: {
    websocket: true
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
