import { defineNitroConfig } from 'nitro/config'
import { cpSync, existsSync } from 'node:fs'
import { resolve } from 'node:path'

const cp = (src: string, dest: string) => {
  if (existsSync(src)) {
    cpSync(src, dest, { recursive: true })
  }
}

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
      cp(
        resolve('node_modules/node-pty/build/Release/pty.node'),
        resolve('.output/server/node_modules/node-pty/build/Release/pty.node')
      )
      cp(
        resolve('node_modules/node-pty/build/Release/spawn-helper'),
        resolve('.output/server/node_modules/node-pty/build/Release/spawn-helper')
      )
      cp(
        resolve('node_modules/node-pty/prebuilds/darwin-arm64/pty.node'),
        resolve('.output/server/node_modules/node-pty/prebuilds/darwin-arm64/pty.node')
      )
    }
  }
})
