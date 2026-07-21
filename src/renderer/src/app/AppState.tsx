import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { AppPreferences } from '../../../shared/contracts/api'
import type { ScanResult } from '../../../shared/contracts/inspector'

type ScanSummary = Pick<ScanResult, 'rootPath' | 'completedAt' | 'scannedFileCount'> & {
  candidateCount: number
}

type AppStateValue = {
  preferences: AppPreferences | null
  lastScan: ScanResult | null
  scanSummary: ScanSummary | null
  setLastScan: (result: ScanResult | null) => void
  refreshPreferences: () => Promise<void>
  clearHistory: () => Promise<void>
  setAiConsent: (enabled: boolean) => Promise<void>
}

const AppState = createContext<AppStateValue | null>(null)
const SUMMARY_KEY = 'restx:last-scan-summary'

function loadSummary(): ScanSummary | null {
  try {
    const value = localStorage.getItem(SUMMARY_KEY)
    return value ? (JSON.parse(value) as ScanSummary) : null
  } catch {
    return null
  }
}

export function AppStateProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [preferences, setPreferences] = useState<AppPreferences | null>(null)
  const [lastScan, setLastScanValue] = useState<ScanResult | null>(null)
  const [scanSummary, setScanSummary] = useState<ScanSummary | null>(loadSummary)

  const refreshPreferences = async (): Promise<void> => {
    setPreferences(await window.restx.app.getPreferences())
  }

  useEffect(() => {
    void refreshPreferences()
  }, [])

  const setLastScan = (result: ScanResult | null): void => {
    setLastScanValue(result)
    if (!result) return
    const summary = {
      rootPath: result.rootPath,
      completedAt: result.completedAt,
      scannedFileCount: result.scannedFileCount,
      candidateCount: result.candidates.length
    }
    setScanSummary(summary)
    localStorage.setItem(SUMMARY_KEY, JSON.stringify(summary))
  }

  const clearHistory = async (): Promise<void> => {
    setPreferences(await window.restx.app.clearHistory())
    setLastScanValue(null)
    setScanSummary(null)
    localStorage.removeItem(SUMMARY_KEY)
  }

  const setAiConsent = async (enabled: boolean): Promise<void> => {
    setPreferences(await window.restx.app.setAiLocalAnalysisEnabled(enabled))
  }

  const value = useMemo(() => ({
    preferences, lastScan, scanSummary, setLastScan, refreshPreferences, clearHistory, setAiConsent
  }), [preferences, lastScan, scanSummary])

  return <AppState.Provider value={value}>{children}</AppState.Provider>
}

export function useAppState(): AppStateValue {
  const value = useContext(AppState)
  if (!value) throw new Error('useAppState must be used inside AppStateProvider')
  return value
}
