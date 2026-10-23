import { randomUUID } from 'node:crypto'
import { copyFile, mkdir, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { nativeImage } from 'electron'
import type { AttachmentInput, DefectAttachment, DefectInput, DefectRecord } from '../shared/contracts'
import { MAX_ANALYSIS_BYTES, MAX_IMAGE_BYTES, MAX_SCREENSHOTS } from '../shared/contracts'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const MAX_RECORDS = 5000
const MAX_TEXT = 20000

export function assertId(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !UUID.test(value)) throw new Error('记录或附件标识无效。')
}

export function validateDtsUrl(url: string): void {
  if (!url) return
  try {
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) throw new Error()
  } catch { throw new Error('请填写有效的 HTTP 或 HTTPS DTS 链接。') }
}

function assertAttachment(value: unknown, image: boolean): asserts value is AttachmentInput {
  if (!value || typeof value !== 'object') throw new Error('附件格式无效。')
  const item = value as Record<string, unknown>
  if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > 255) throw new Error('附件名称无效。')
  if (!image && !/\.md$/i.test(item.name)) throw new Error('分析结果只支持 .md 文件。')
  if ('id' in item) {
    assertId(item.id)
    if ('data' in item) throw new Error('附件不能同时包含标识和内容。')
  } else {
    const limit = image ? MAX_IMAGE_BYTES : MAX_ANALYSIS_BYTES
    if (typeof item.data !== 'string' || item.data.length > Math.ceil(limit / 3) * 4 || item.data.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(item.data)) {
      throw new Error(image ? '截图无效或超过 10 MB。' : '分析文件无效或超过 5 MB。')
    }
  }
}

function assertInput(value: unknown): asserts value is DefectInput {
  if (!value || typeof value !== 'object') throw new Error('记录格式无效。')
  const input = value as Record<string, unknown>
  if (input.id !== undefined) assertId(input.id)
  for (const field of ['phenomenon', 'characteristics', 'dtsNumber', 'dtsUrl']) {
    if (typeof input[field] !== 'string' || input[field].length > MAX_TEXT) throw new Error('文本格式无效或超过 20000 字。')
  }
  if (!(input.phenomenon as string).trim()) throw new Error('请填写问题现象。')
  validateDtsUrl(input.dtsUrl as string)
  if (!Array.isArray(input.screenshots) || input.screenshots.length > MAX_SCREENSHOTS) throw new Error('每条记录最多添加 20 张截图。')
  for (const item of input.screenshots) assertAttachment(item, true)
  if (input.analysis !== null) assertAttachment(input.analysis, false)
}

function cell(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\\/g, '\\\\').replace(/([`*_[\]{}!])/g, '\\$1').replace(/\|/g, '&#124;').replace(/\r?\n/g, '<br>')
}

export class DefectStore {
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly root: string) {}

  private serialized<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.queue.then(operation, operation)
    this.queue = result.catch(() => undefined)
    return result
  }

  private assetPath(id: string, suffix: string): string {
    assertId(id)
    return path.join(this.root, 'attachments', `${id}${suffix}`)
  }

  private async readRecords(): Promise<DefectRecord[]> {
    let content: string
    try { content = await readFile(path.join(this.root, 'records.json'), 'utf8') }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') return []
      throw new Error('无法读取缺陷记录，请检查数据目录。')
    }
    try {
      const data: unknown = JSON.parse(content)
      if (!data || typeof data !== 'object' || !('version' in data) || data.version !== 1 || !('records' in data) || !Array.isArray(data.records) || data.records.length > MAX_RECORDS) throw new Error()
      const ids = new Set<string>()
      for (const record of data.records) {
        assertInput(record)
        assertId(record.id)
        if (ids.has(record.id)) throw new Error()
        ids.add(record.id)
        for (const asset of [...record.screenshots, ...(record.analysis ? [record.analysis] : [])]) {
          if (!('id' in asset)) throw new Error()
        }
        const saved = record as unknown as DefectRecord
        if (!Number.isFinite(Date.parse(saved.createdAt)) || !Number.isFinite(Date.parse(saved.updatedAt))) throw new Error()
      }
      return data.records as DefectRecord[]
    } catch { throw new Error('缺陷记录文件格式损坏，请先备份并修复；不会覆盖已有数据。') }
  }

  private async writeRecords(records: DefectRecord[]): Promise<void> {
    await mkdir(this.root, { recursive: true })
    const temporary = path.join(this.root, `${randomUUID()}.tmp`)
    try {
      await writeFile(temporary, JSON.stringify({ version: 1, records }, null, 2), { flag: 'wx', mode: 0o600 })
      await rename(temporary, path.join(this.root, 'records.json'))
    } finally { await this.cleanup([temporary]) }
  }

  private async cleanup(files: string[]): Promise<void> {
    for (const file of files) {
      await rm(file, { force: true }).catch(() => console.warn('[defect-manager] Attachment cleanup deferred.'))
    }
  }

  private filesFor(record: DefectRecord): string[] {
    return [
      ...record.screenshots.flatMap((item) => [this.assetPath(item.id, '.png'), this.assetPath(item.id, '.thumb.png')]),
      ...(record.analysis ? [this.assetPath(record.analysis.id, '.md')] : [])
    ]
  }

  list(): Promise<DefectRecord[]> { return this.serialized(() => this.readRecords()) }

  save(value: unknown): Promise<DefectRecord> {
    assertInput(value)
    const input = structuredClone(value)
    return this.serialized(async () => {
      const records = await this.readRecords()
      const previous = records.find((row) => row.id === input.id)
      if (input.id && !previous) throw new Error('记录已不存在，请刷新列表。')
      if (!previous && records.length >= MAX_RECORDS) throw new Error('最多保存 5000 条记录。')
      await mkdir(path.join(this.root, 'attachments'), { recursive: true })
      const created: string[] = []
      const importAsset = async (asset: AttachmentInput, image: boolean): Promise<DefectAttachment> => {
        if ('id' in asset) {
          const allowed = image ? previous?.screenshots : previous?.analysis ? [previous.analysis] : []
          const existing = allowed?.find((item) => item.id === asset.id)
          if (!existing) throw new Error('附件不属于当前记录，请重新选择。')
          return existing
        }
        const id = randomUUID()
        const bytes = Buffer.from(asset.data, 'base64')
        if (bytes.length > (image ? MAX_IMAGE_BYTES : MAX_ANALYSIS_BYTES)) throw new Error('附件超出大小限制。')
        const destination = this.assetPath(id, image ? '.png' : '.md')
        created.push(destination)
        if (image) {
          const decoded = nativeImage.createFromBuffer(bytes)
          const size = decoded.getSize()
          if (decoded.isEmpty() || size.width * size.height > 40_000_000) throw new Error('图片无法读取或像素过大，请使用 PNG、JPEG 或 WebP 截图。')
          await writeFile(destination, decoded.toPNG(), { flag: 'wx', mode: 0o600 })
          const thumbnail = this.assetPath(id, '.thumb.png')
          created.push(thumbnail)
          const scale = Math.min(1, 144 / size.width, 96 / size.height)
          await writeFile(thumbnail, decoded.resize({ width: Math.max(1, Math.round(size.width * scale)), height: Math.max(1, Math.round(size.height * scale)) }).toPNG(), { flag: 'wx', mode: 0o600 })
        } else {
          try { new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
          catch { throw new Error('分析文件需要使用 UTF-8 编码。') }
          await writeFile(destination, bytes, { flag: 'wx', mode: 0o600 })
        }
        return { id, name: path.basename(asset.name) }
      }
      let record: DefectRecord
      try {
        const screenshots: DefectAttachment[] = []
        for (const item of input.screenshots) screenshots.push(await importAsset(item, true))
        const now = new Date().toISOString()
        record = {
          id: previous?.id ?? randomUUID(), phenomenon: input.phenomenon.trim(), characteristics: input.characteristics,
          dtsNumber: input.dtsNumber, dtsUrl: input.dtsUrl, screenshots,
          analysis: input.analysis ? await importAsset(input.analysis, false) : null,
          createdAt: previous?.createdAt ?? now, updatedAt: now
        }
        await this.writeRecords([record, ...records.filter((row) => row.id !== record.id)])
      } catch (error) { await this.cleanup(created); throw error }
      if (previous) {
        const retained = new Set(this.filesFor(record))
        await this.cleanup(this.filesFor(previous).filter((file) => !retained.has(file)))
      }
      return record
    })
  }

  remove(id: unknown): Promise<void> {
    assertId(id)
    return this.serialized(async () => {
      const records = await this.readRecords()
      const record = records.find((row) => row.id === id)
      if (!record) throw new Error('记录已不存在。')
      await this.writeRecords(records.filter((row) => row.id !== id))
      await this.cleanup(this.filesFor(record))
    })
  }

  async find(id: unknown): Promise<DefectRecord> {
    assertId(id)
    const record = (await this.list()).find((row) => row.id === id)
    if (!record) throw new Error('记录已不存在，请刷新列表。')
    return record
  }

  async image(recordId: unknown, assetId: unknown, full: unknown): Promise<string> {
    assertId(assetId)
    if (typeof full !== 'boolean') throw new Error('图片请求无效。')
    const record = await this.find(recordId)
    if (!record.screenshots.some((item) => item.id === assetId)) throw new Error('截图不存在。')
    const bytes = await readFile(this.assetPath(assetId, full ? '.png' : '.thumb.png'))
    return `data:image/png;base64,${bytes.toString('base64')}`
  }

  async analysisPath(id: unknown): Promise<string> {
    const record = await this.find(id)
    if (!record.analysis) throw new Error('尚未添加分析文件。')
    return this.assetPath(record.analysis.id, '.md')
  }

  exportMarkdown(ids: unknown, destination: string): Promise<string> {
    if (!Array.isArray(ids) || !ids.length || ids.length > MAX_RECORDS) throw new Error('请选择要导出的记录。')
    ids.forEach(assertId)
    const selected = new Set(ids)
    return this.serialized(async () => {
      const rows = (await this.readRecords()).filter((row) => selected.has(row.id))
      if (rows.length !== selected.size) throw new Error('部分记录已不存在，请刷新后重新导出。')
      const directory = await mkdtemp(path.join(destination, 'RestX-defects-'))
      const assets = path.join(directory, 'attachments')
      await mkdir(assets)
      const lines = [
        '# 缺陷列表', '', `共 ${rows.length} 条记录`, '',
        '> 请将本文件与 attachments 文件夹一起保留。若 IDEA 显示破图，请通过 File → Open 打开整个导出文件夹，再预览本文件。', '',
        '| 问题现象 | 问题特征 | 截图 | DTS 单 | 分析结果 |', '| --- | --- | --- | --- | --- |'
      ]
      try {
        for (const row of rows) {
          const images: string[] = []
          for (const [index, screenshot] of row.screenshots.entries()) {
            await copyFile(this.assetPath(screenshot.id, '.png'), path.join(assets, `${screenshot.id}.png`))
            await copyFile(this.assetPath(screenshot.id, '.thumb.png'), path.join(assets, `${screenshot.id}.thumb.png`))
            images.push(`[![截图 ${index + 1}](attachments/${screenshot.id}.thumb.png)](attachments/${screenshot.id}.png)`)
          }
          let analysis = '—'
          if (row.analysis) {
            await copyFile(this.assetPath(row.analysis.id, '.md'), path.join(assets, `${row.analysis.id}.md`))
            analysis = `[${cell(row.analysis.name)}](attachments/${row.analysis.id}.md)`
          }
          const dts = row.dtsUrl ? `[${cell(row.dtsNumber || row.dtsUrl)}](<${row.dtsUrl.replace(/[\s<>|\\]/g, (character) => encodeURIComponent(character))}>)` : cell(row.dtsNumber) || '—'
          lines.push(`| ${cell(row.phenomenon)} | ${cell(row.characteristics)} | ${images.join(' ')} | ${dts} | ${analysis} |`)
        }
        await writeFile(path.join(directory, 'defects.md'), `${lines.join('\n')}\n`, { flag: 'wx' })
        return directory
      } catch {
        // Keep copied evidence for recovery, but never leave a success-looking final document.
        throw new Error('导出未完成，请检查附件和目标目录权限；已复制的附件保留在本次导出目录，可删除后重试。')
      }
    })
  }
}
