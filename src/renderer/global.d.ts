import type { RestXApi } from '../app-api'

declare global {
  interface Window {
    restx: RestXApi
  }
}

export {}
