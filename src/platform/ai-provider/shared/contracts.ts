export type AiProviderSource = 'manual' | 'claude-code'

export type AiProviderStatus = 'ready' | 'incomplete' | 'unavailable'

export type AiProviderCustomHeaderInput = {
  name: string
  value: string
}

export type AiProviderPublic = {
  id: string
  name: string
  source: AiProviderSource
  baseUrl: string
  modelId: string
  useSystemProxy: boolean
  customHeaders?: Record<string, string>
  apiKeyConfigured: boolean
  status: AiProviderStatus
  statusMessage?: string
  active: boolean
  editable: boolean
  identityFingerprint: string
}

export type AiProviderState = {
  providers: AiProviderPublic[]
  activeProviderId: string | null
}

export type CreateAiProviderInput = {
  name: string
  baseUrl: string
  modelId: string
  apiKey: string
}

export type UpdateAiProviderInput = {
  id: string
  name: string
  baseUrl: string
  modelId: string
  apiKey?: string
}

export type AiProviderTestResult = {
  ok: boolean
  message: string
  durationMs: number
}

export type AiProviderApi = {
  providers: {
    getState(): Promise<AiProviderState>
    create(input: CreateAiProviderInput): Promise<AiProviderState>
    update(input: UpdateAiProviderInput): Promise<AiProviderState>
    delete(id: string): Promise<AiProviderState>
    setActive(id: string): Promise<AiProviderState>
    setSystemProxy(id: string, enabled: boolean): Promise<AiProviderState>
    setCustomHeaders(id: string, headers: AiProviderCustomHeaderInput[]): Promise<AiProviderState>
    test(id: string): Promise<AiProviderTestResult>
    refreshExternal(): Promise<AiProviderState>
  }
}

export type ResolvedAiProvider = {
  id: string
  name: string
  source: AiProviderSource
  baseUrl: string
  modelId: string
  useSystemProxy: boolean
  apiKey: string
  customHeaders: Record<string, string>
  identityFingerprint: string
  credentialFingerprint: string
}

export type AiProviderExecutionContext = {
  provider: ResolvedAiProvider
  fetch: typeof fetch
}
