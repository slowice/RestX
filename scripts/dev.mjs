import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const electronViteCli = join(
  projectRoot,
  'node_modules',
  'electron-vite',
  'bin',
  'electron-vite.js'
)

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: projectRoot,
    env: process.env,
    stdio: 'inherit',
    ...options
  })

  if (result.error) {
    console.error(`[dev] Failed to run ${command}: ${result.error.message}`)
    process.exit(1)
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

if (!existsSync(electronViteCli)) {
  console.log('[dev] electron-vite is missing; installing development dependencies...')

  const installEnv = { ...process.env }
  for (const name of [
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'ALL_PROXY',
    'http_proxy',
    'https_proxy',
    'all_proxy'
  ]) {
    delete installEnv[name]
  }

  if (process.env.npm_execpath) {
    run(
      process.execPath,
      [process.env.npm_execpath, 'install', '--frozen-lockfile', '--prod=false'],
      { env: installEnv }
    )
  } else {
    run(
      process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm',
      ['install', '--frozen-lockfile', '--prod=false'],
      { env: installEnv }
    )
  }
}

run(process.execPath, [electronViteCli, 'dev'])
