import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { getRestxStorageLayout } from '../../../platform/main/storage'
import { HomeError } from './home-error'

export function getHomeConfigRoot(): string {
  const override = process.env.RESTX_HOME_CONFIG_ROOT?.trim()
  const root = override || getRestxStorageLayout().config
  if (!path.isAbsolute(root)) throw new HomeError('INVALID_INPUT', '首页存储目录配置无效。')
  mkdirSync(root, { recursive: true, mode: 0o700 })
  return root
}
