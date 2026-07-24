import type { AiInspectorApi } from './features/ai-inspector/shared/api'
import type { CodeReviewApi } from './features/code-review/shared/api'
import type { MailTemplateApi } from './features/mail-template/shared/api'
import type { KnowledgeMapApi } from './features/knowledge-map/shared/api'
import type { PlatformApi } from './platform/shared/platform-api'

export type RestXApi = PlatformApi & AiInspectorApi & CodeReviewApi & KnowledgeMapApi & MailTemplateApi
