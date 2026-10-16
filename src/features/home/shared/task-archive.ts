import type { HomeTaskRow } from './contracts'

export function getTaskArchiveMonth(row: HomeTaskRow, now = new Date()): string {
  const date = row.cells.date ?? ''
  if (/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(date)) {
    const parsed = new Date(`${date}T00:00:00Z`)
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date) return date.slice(0, 7)
  }
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
}

export function formatArchiveMonth(month: string): string {
  return `${month.slice(0, 4)}年${Number(month.slice(5))}月`
}
