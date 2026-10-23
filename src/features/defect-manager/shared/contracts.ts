export type DefectAttachment = { id: string; name: string }
export type DefectRecord = {
  id: string
  phenomenon: string
  characteristics: string
  dtsNumber: string
  dtsUrl: string
  screenshots: DefectAttachment[]
  analysis: DefectAttachment | null
  createdAt: string
  updatedAt: string
}

export type AttachmentInput = { id: string; name: string } | { name: string; data: string }
export type DefectInput = Omit<DefectRecord, 'id' | 'createdAt' | 'updatedAt' | 'screenshots' | 'analysis'> & {
  id?: string
  screenshots: AttachmentInput[]
  analysis: AttachmentInput | null
}
export const MAX_SCREENSHOTS = 20
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const MAX_ANALYSIS_BYTES = 5 * 1024 * 1024
