import { useState } from 'react'

export type FileRevealController = {
  error: string
  reveal(path: string): Promise<void>
  clearError(): void
}

export function useFileReveal(): FileRevealController {
  const [error, setError] = useState('')

  const reveal = async (path: string): Promise<void> => {
    setError('')
    try {
      await window.restx.inspector.revealInFolder(path)
    } catch (reason) {
      setError(cleanRevealError(reason))
    }
  }

  return {
    error,
    reveal,
    clearError: () => setError('')
  }
}

export function cleanRevealError(reason: unknown): string {
  return reason instanceof Error
    ? reason.message.replace(/^Error invoking remote method '[^']+': Error: /, '')
    : '无法打开文件位置，请确认文件仍然存在。'
}
