import { describe, expect, it, vi } from 'vitest'
import { revealAuthorizedFile } from '../src/features/ai-inspector/main/services/file-reveal'

describe('AI Inspector file reveal', () => {
  it('reveals the resolved authorized file', async () => {
    const showItemInFolder = vi.fn()
    await revealAuthorizedFile('/scan/history.jsonl', {
      assertAuthorized: vi.fn(async () => '/real/scan/history.jsonl'),
      lstat: vi.fn(async () => ({ isFile: () => true })),
      showItemInFolder
    })

    expect(showItemInFolder).toHaveBeenCalledWith('/real/scan/history.jsonl')
  })

  it('does not inspect or reveal an unauthorized path', async () => {
    const lstat = vi.fn()
    const showItemInFolder = vi.fn()

    await expect(revealAuthorizedFile('/outside/history.jsonl', {
      assertAuthorized: vi.fn(async () => { throw new Error('该路径尚未获得 RestX 授权，请重新选择目录。') }),
      lstat,
      showItemInFolder
    })).rejects.toThrow('尚未获得 RestX 授权')

    expect(lstat).not.toHaveBeenCalled()
    expect(showItemInFolder).not.toHaveBeenCalled()
  })

  it('reports a missing file without invoking the file manager', async () => {
    const showItemInFolder = vi.fn()

    await expect(revealAuthorizedFile('/scan/missing.jsonl', {
      assertAuthorized: vi.fn(async (path) => path),
      lstat: vi.fn(async () => { throw new Error('ENOENT') }),
      showItemInFolder
    })).rejects.toThrow('文件不存在或已被移动')

    expect(showItemInFolder).not.toHaveBeenCalled()
  })
})
