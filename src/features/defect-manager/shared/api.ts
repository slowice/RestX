import type { DefectInput, DefectRecord } from './contracts'

export type DefectManagerApi = {
  defects: {
    list(): Promise<DefectRecord[]>
    save(input: DefectInput): Promise<DefectRecord>
    remove(id: string): Promise<void>
    image(recordId: string, assetId: string, full: boolean): Promise<string>
    openAnalysis(id: string): Promise<void>
    openDts(id: string): Promise<void>
    exportMarkdown(ids: string[]): Promise<string | null>
  }
}
