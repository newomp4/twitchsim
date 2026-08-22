#!/usr/bin/env node
/**
 * Builds the zip you hand to someone who just wants the After Effects panel.
 *   npm run package        build:cep + assemble release/ + zip it
 * The result is release/TwitchSim-AE-Panel.zip — the panel plus double-click
 * installers for macOS / Windows, so the other end needs no Node, npm or Git.
 * Edit the installers and the read-me in packaging/; this script only copies them.
 */
import { chmodSync, cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const out = join(root, 'release')
const folder = 'TwitchSim AE Panel' // what the friend sees after unzipping
const stage = join(out, folder)
const zip = join(out, 'TwitchSim-AE-Panel.zip')

if (!existsSync(join(root, 'cep', 'client', 'index.html'))) {
  console.error('cep/client is missing — run `npm run build:cep` first.')
  process.exit(1)
}

rmSync(out, { recursive: true, force: true })
mkdirSync(stage, { recursive: true })

// the extension itself: everything CEP needs, minus cep/.debug (dev-only remote debugging)
const ext = join(stage, 'com.twitchsim.panel')
mkdirSync(ext)
for (const part of ['CSXS', 'client', 'host']) cpSync(join(root, 'cep', part), join(ext, part), { recursive: true, dereference: true })

const installers = ['Install on Mac.command', 'Uninstall on Mac.command', 'Install on Windows.bat', 'Uninstall on Windows.bat', 'READ ME FIRST.txt']
for (const f of installers) cpSync(join(root, 'packaging', f), join(stage, f))
for (const f of installers.filter((f) => f.endsWith('.command'))) chmodSync(join(stage, f), 0o755)

// -X keeps macOS metadata folders out of the archive so it looks clean on Windows too
execFileSync('zip', ['-r', '-X', '-q', zip, folder, '-x', '*.DS_Store'], { cwd: out })

console.log(`✓ ${zip}`)
console.log('  Send that one file. They unzip it and run the installer for their OS.')
