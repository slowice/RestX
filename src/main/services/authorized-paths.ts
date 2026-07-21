import { lstat, realpath } from 'node:fs/promises'
import path from 'node:path'

export class AuthorizationError extends Error {
  constructor(message = '该路径尚未获得 RestX 授权，请重新选择目录。') {
    super(message)
    this.name = 'AuthorizationError'
  }
}

class AuthorizedPaths {
  private roots = new Set<string>()

  async authorize(directory: string): Promise<string> {
    const resolved = await realpath(path.resolve(directory))
    const stat = await lstat(resolved)
    if (!stat.isDirectory()) throw new AuthorizationError('只能授权文件夹。')
    this.roots.add(resolved)
    return resolved
  }

  async assertAuthorized(candidate: string): Promise<string> {
    let resolved: string
    try {
      resolved = await realpath(path.resolve(candidate))
    } catch {
      resolved = path.resolve(candidate)
    }
    const authorized = [...this.roots].some((root) => {
      const relative = path.relative(root, resolved)
      return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative))
    })
    if (!authorized) throw new AuthorizationError()
    return resolved
  }

  clear(): void {
    this.roots.clear()
  }
}

export const authorizedPaths = new AuthorizedPaths()
