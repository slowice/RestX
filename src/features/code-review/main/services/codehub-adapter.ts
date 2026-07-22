import type { MergeRequestLocator } from '../../shared/contracts/code-review'
import { ReviewSourceError, type LoadedReviewSource, type MergeRequestSourceAdapter } from './code-review-source'

export class CodeHubAdapter implements MergeRequestSourceAdapter {
  readonly id = 'codehub' as const
  readonly zone = 'yellow' as const

  constructor(private readonly configuredHosts: string[] = []) {}

  matches(url: URL): boolean {
    return this.configuredHosts.some((host) => host.toLowerCase() === url.hostname.toLowerCase())
  }

  parseUrl(_url: URL): MergeRequestLocator {
    throw new ReviewSourceError('CodeHub URL 解析需要进入黄区后根据平台文档补充。', 'ADAPTER_NOT_CONFIGURED')
  }

  async load(_locator: MergeRequestLocator): Promise<LoadedReviewSource> {
    throw new ReviewSourceError('CodeHub API 适配器框架已就绪，请在黄区补充核心请求函数。', 'ADAPTER_NOT_CONFIGURED')
  }
}
