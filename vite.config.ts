import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

/** Dev-only helper: POST /__twitchsim_save?name=x.webm stores the body under ./.dev-exports (used for automated export checks). */
function devSavePlugin(): Plugin {
  return {
    name: 'twitchsim-dev-save',
    apply: 'serve',
    configureServer(server) {
      if (!process.env.TWITCHSIM_DEV_SAVE) return
      server.middlewares.use('/__twitchsim_save', (req, res) => {
        const url = new URL(req.url ?? '/', 'http://localhost')
        const name = (url.searchParams.get('name') ?? 'export.bin').replace(/[^a-z0-9._-]/gi, '_')
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => {
          const dir = join(process.cwd(), '.dev-exports')
          mkdirSync(dir, { recursive: true })
          writeFileSync(join(dir, name), Buffer.concat(chunks))
          res.statusCode = 200
          res.end('ok')
        })
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devSavePlugin()],
  // GitHub Pages serves from /twitchsim/; local dev and other hosts use /
  base: process.env.GITHUB_PAGES ? '/twitchsim/' : '/',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
  },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
