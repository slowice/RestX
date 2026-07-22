export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value))
}

export function formatFullDate(value: string): string {
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
  }).format(new Date(value))
}

export function formatRelativeDate(value: string, now = Date.now()): string {
  const milliseconds = new Date(value).getTime()
  if (!Number.isFinite(milliseconds)) return ''
  const deltaSeconds = Math.round((milliseconds - now) / 1000)
  const absoluteSeconds = Math.abs(deltaSeconds)
  if (absoluteSeconds < 45) return deltaSeconds > 0 ? '即将发生' : '刚刚'
  const formatter = new Intl.RelativeTimeFormat('zh-CN', { numeric: 'auto' })
  if (absoluteSeconds < 60 * 60) return formatter.format(Math.round(deltaSeconds / 60), 'minute')
  if (absoluteSeconds < 60 * 60 * 24) return formatter.format(Math.round(deltaSeconds / 60 / 60), 'hour')
  if (absoluteSeconds < 60 * 60 * 24 * 30) return formatter.format(Math.round(deltaSeconds / 60 / 60 / 24), 'day')
  if (absoluteSeconds < 60 * 60 * 24 * 365) return formatter.format(Math.round(deltaSeconds / 60 / 60 / 24 / 30), 'month')
  return formatter.format(Math.round(deltaSeconds / 60 / 60 / 24 / 365), 'year')
}
