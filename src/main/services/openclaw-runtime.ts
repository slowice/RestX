import type { RuntimeStatus } from '../../shared/contracts/ai-capability'
import { providerSettings } from './provider-settings'

// Phase 1 deliberately does not start a model or read local file contents.
// This service owns the future Gateway lifecycle so UI features never call it directly.
class OpenClawRuntime {
  getStatus(): RuntimeStatus {
    const settings = providerSettings.getPublic()
    return settings.model && settings.apiKeyConfigured ? 'ready' : 'stopped'
  }
}

export const openClawRuntime = new OpenClawRuntime()
