import type { HomeLoginInput, HomeLoginState, HomeTaskTable } from '../shared/contracts'
import { createHomeCredentialStore, type HomeCredentialStore } from './credential-store'
import type { HomePostLoginCallback } from './post-login-callback'
import { createHomeTaskStore, type HomeTaskStore } from './task-store'

export class HomeService {
  private isLoggedIn = false
  private callbackRunId = 0
  private callbackStatus: HomeLoginState['callbackStatus'] = 'idle'
  private callbackError: string | null = null

  constructor(
    private readonly credentials: HomeCredentialStore,
    private readonly tasks: HomeTaskStore,
    private readonly postLoginCallback: HomePostLoginCallback
  ) {}

  getLoginState(): HomeLoginState {
    return {
      account: this.credentials.getAccount(),
      isLoggedIn: this.isLoggedIn,
      callbackStatus: this.callbackStatus,
      callbackError: this.callbackError
    }
  }

  login(input: HomeLoginInput): HomeLoginState {
    console.info('[home-daily][02] login_ipc_validated account_present=true password_present=true')
    this.credentials.save(input)
    console.info('[home-daily][03] credentials_saved secure_storage=true')
    this.isLoggedIn = true
    this.callbackStatus = 'running'
    this.callbackError = null
    const runId = ++this.callbackRunId
    setTimeout(() => void this.runPostLoginCallback(runId, input), 0)
    return this.getLoginState()
  }

  async getTaskTable(): Promise<HomeTaskTable> {
    const table = await this.tasks.get()
    console.info(`[home-daily][07] task_table_loaded columns=${table.columns.length} rows=${table.rows.length}`)
    return table
  }

  async saveTaskTable(table: unknown): Promise<HomeTaskTable> {
    const columnCount = table && typeof table === 'object' && Array.isArray((table as Record<string, unknown>).columns)
      ? ((table as Record<string, unknown>).columns as unknown[]).length
      : -1
    const rowCount = table && typeof table === 'object' && Array.isArray((table as Record<string, unknown>).rows)
      ? ((table as Record<string, unknown>).rows as unknown[]).length
      : -1
    console.info(`[home-daily][08] task_save_requested columns=${columnCount} rows=${rowCount}`)
    const saved = await this.tasks.save(table)
    console.info(`[home-daily][09] task_table_saved columns=${saved.columns.length} rows=${saved.rows.length}`)
    return saved
  }

  private async runPostLoginCallback(runId: number, input: HomeLoginInput): Promise<void> {
    console.info('[home-daily][05] post_login_callback_started')
    try {
      await this.postLoginCallback(input)
      if (runId !== this.callbackRunId) return
      this.callbackStatus = 'succeeded'
      this.callbackError = null
      console.info('[home-daily][06] post_login_callback_succeeded')
    } catch (reason) {
      if (runId !== this.callbackRunId) return
      this.callbackStatus = 'failed'
      this.callbackError = '登录后操作执行失败，不影响任务记录使用。'
      const errorType = reason instanceof Error ? reason.name : 'UnknownError'
      console.error(`[home-daily][06] post_login_callback_failed error_type=${errorType}`)
    }
  }
}

export function createHomeService(postLoginCallback: HomePostLoginCallback): HomeService {
  return new HomeService(createHomeCredentialStore(), createHomeTaskStore(), postLoginCallback)
}
