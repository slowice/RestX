export type HomeLoginCallbackStatus = 'idle' | 'running' | 'succeeded' | 'failed'

export type HomeLoginInput = {
  account: string
  password: string
}

export type HomeLoginState = {
  account: string
  isLoggedIn: boolean
  callbackStatus: HomeLoginCallbackStatus
  callbackError: string | null
}

export type HomeTaskColumnType = 'text' | 'date' | 'select'

export type HomeTaskColumn = {
  id: string
  label: string
  type: HomeTaskColumnType
  options?: string[]
}

export type HomeTaskRow = {
  id: string
  cells: Record<string, string>
  createdAt: string
  updatedAt: string
}

export type HomeTaskTable = {
  version: 1
  columns: HomeTaskColumn[]
  rows: HomeTaskRow[]
}
