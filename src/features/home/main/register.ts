import { defineMainFeature } from '../../../platform/main/define-feature'
import { homeChannels as channels } from '../shared/channels'
import type { HomeLoginInput } from '../shared/contracts'
import { HomeError } from './home-error'
import { createHomeService } from './home-service'
import { homePostLoginCallback } from './post-login-callback'

const MAX_ACCOUNT_LENGTH = 320
const MAX_PASSWORD_LENGTH = 20_000

function assertLoginInput(value: unknown): asserts value is HomeLoginInput {
  if (!value || typeof value !== 'object') throw new HomeError('INVALID_INPUT', '请输入账号和密码。')
  const input = value as Record<string, unknown>
  if (typeof input.account !== 'string' || !input.account.trim() || input.account.length > MAX_ACCOUNT_LENGTH) {
    throw new HomeError('INVALID_INPUT', '请输入有效账号。')
  }
  if (typeof input.password !== 'string' || !input.password || input.password.length > MAX_PASSWORD_LENGTH) {
    throw new HomeError('INVALID_INPUT', '请输入有效密码。')
  }
  input.account = input.account.trim()
}

const service = createHomeService(homePostLoginCallback)

export const homeMainFeature = defineMainFeature({
  id: 'home',
  provides: ['home.main'],
  channels: Object.values(channels),
  register({ ipc }) {
    ipc.handle(channels.getLoginState, () => service.getLoginState())
    ipc.handle(channels.login, (_event, input: unknown) => {
      assertLoginInput(input)
      return service.login(input)
    })
    ipc.handle(channels.getTaskTable, () => service.getTaskTable())
    ipc.handle(channels.saveTaskTable, (_event, table: unknown) => service.saveTaskTable(table))
  }
})
