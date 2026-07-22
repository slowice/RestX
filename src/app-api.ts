import type { AiInspectorApi } from './features/ai-inspector/shared/api'
import type { CodeReviewApi } from './features/code-review/shared/api'
import type { PlatformApi } from './platform/shared/platform-api'

export type RestXApi = PlatformApi & AiInspectorApi & CodeReviewApi
