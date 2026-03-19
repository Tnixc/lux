import { defineConfig } from 'vite-plus'
import { nitro } from 'nitro/vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  preview: { allowedHosts: true },
  plugins: [nitro(), react(), tailwindcss()],
  staged: {
    '*': 'vp check --fix'
  },
  fmt: {
    quoteProps: 'preserve',
    printWidth: 100,
    singleQuote: true,
    semi: false,
    trailingComma: 'none',
    tabWidth: 2,
    jsxSingleQuote: true,
    useTabs: false,
    sortPackageJson: true
  },
  lint: {}
})
