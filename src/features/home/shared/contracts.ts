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
  width?: number
}

export const HOME_TASK_COLUMN_MIN_WIDTH = 90
export const HOME_TASK_COLUMN_MAX_WIDTH = 600

export function getDefaultHomeTaskColumnWidth(column: Pick<HomeTaskColumn, 'id' | 'type'>): number {
  if (column.id === 'date') return 140
  if (column.id === 'task' || column.id === 'notes') return 300
  if (column.id === 'status') return 130
  if (column.id === 'priority') return 110
  return column.type === 'text' ? 180 : 140
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
