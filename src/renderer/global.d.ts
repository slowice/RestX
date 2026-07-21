import type { RestXApi } from '../shared/contracts/api'

declare global {
  interface Window {
    restx: RestXApi
  }
}

export {}
