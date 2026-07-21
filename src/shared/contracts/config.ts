export type ConfigFormat = 'json' | 'yaml' | 'toml' | 'ini' | 'env' | 'text'

export type ConfigValue = string | number | boolean | null | ConfigValue[] | { [key: string]: ConfigValue }

export type ConfigDocument = {
  path: string
  name: string
  format: ConfigFormat
  sizeBytes: number
  modifiedAt: string
  sourceHash: string
  redactedText: string
  data: ConfigValue | null
  parseError: string | null
  redactionCount: number
}
