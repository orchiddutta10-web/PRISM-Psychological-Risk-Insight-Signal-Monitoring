/**
 * Dev-server launcher.
 *
 * Forces NODE_ENV=development before spawning `next dev`. Without this, a
 * machine/user-level NODE_ENV=production (see start_all.bat note) makes
 * Next.js boot in production mode and the dev overlay surfaces opaque errors
 * like "[object Event]" / 500s on missing chunks.
 *
 * Cross-platform: no shell tricks, just spawn with an explicit env.
 */
const { spawn } = require('node:child_process')
const path = require('node:path')

const env = { ...process.env, NODE_ENV: 'development' }
const nextBin = path.join(__dirname, '..', 'node_modules', '.bin',
  process.platform === 'win32' ? 'next.cmd' : 'next')

const child = spawn(nextBin, ['dev'], {
  stdio: 'inherit',
  env,
  shell: process.platform === 'win32',
})

child.on('exit', (code, signal) => {
  if (signal) console.log(`next dev terminated by ${signal}`)
  process.exit(code ?? 0)
})

process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
