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

/**
 * After Effects panel build (TWITCHSIM_CEP=1): the page is loaded from file:// inside Adobe CEP
 * (Chromium 99), where ES-module <script type="module"> tags are blocked by CORS. So we emit one
 * classic IIFE bundle, inline fonts/images as data URIs and strip module attributes from the HTML.
 */
function cepHtmlPlugin(): Plugin {
  return {
    name: 'twitchsim-cep-html',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html
          .replace(/<link rel="modulepreload"[^>]*>\s*/g, '')
          .replace(/<script type="module" crossorigin src="/g, '<script defer src="')
          .replace(/<script type="module" src="/g, '<script defer src="')
          .replace(/ crossorigin(="[^"]*")?/g, '')
      },
    },
  }
}

const CEP = !!process.env.TWITCHSIM_CEP

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), devSavePlugin(), ...(CEP ? [cepHtmlPlugin()] : [])],
  // GitHub Pages serves from /twitchsim/; the AE panel from file:// (relative); local dev and other hosts use /
  base: CEP ? './' : process.env.GITHUB_PAGES ? '/twitchsim/' : '/',
  build: CEP
    ? {
        target: 'chrome99',
        outDir: 'cep/client',
        emptyOutDir: true,
        assetsInlineLimit: 32 * 1024 * 1024,
        modulePreload: false,
        cssCodeSplit: false,
        chunkSizeWarningLimit: 8000,
        rollupOptions: {
          output: {
            format: 'iife',
            inlineDynamicImports: true,
            entryFileNames: 'assets/twitchsim.js',
            assetFileNames: 'assets/[name][extname]',
          },
        },
      }
    : {
        target: 'es2022',
        chunkSizeWarningLimit: 1500,
      },
  optimizeDeps: {
    exclude: ['@ffmpeg/ffmpeg', '@ffmpeg/util'],
  },
})
