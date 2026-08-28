import type { HomeLoginInput, HomeLoginState, HomeTaskTable } from './contracts'

export type HomeApi = {
  home: {
    getLoginState(): Promise<HomeLoginState>
    login(input: HomeLoginInput): Promise<HomeLoginState>
    getTaskTable(): Promise<HomeTaskTable>
    saveTaskTable(table: HomeTaskTable): Promise<HomeTaskTable>
  }
}
