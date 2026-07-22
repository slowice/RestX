export type PlatformApi = {
  app: {
    getVersion(): Promise<string>
  }
}

export const platformChannels = {
  getVersion: 'platform:app:get-version'
} as const
