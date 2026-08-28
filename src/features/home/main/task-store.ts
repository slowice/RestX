import { randomUUID } from 'node:crypto'
import { chmod, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { HomeTaskColumn, HomeTaskRow, HomeTaskTable } from '../shared/contracts'
import { HomeError } from './home-error'
import { getHomeConfigRoot } from './storage-root'

const MAX_COLUMNS = 40
const MAX_ROWS = 5_000
const MAX_LABEL_LENGTH = 80
const MAX_CELL_LENGTH = 10_000
const VALID_ID = /^[A-Za-z0-9_-]{1,100}$/

export function createDefaultTaskTable(): HomeTaskTable {
  return {
    version: 1,
    columns: [
      { id: 'date', label: '日期', type: 'date' },
      { id: 'task', label: '任务内容', type: 'text' },
      { id: 'status', label: '状态', type: 'select', options: ['待办', '进行中', '完成'] },
      { id: 'priority', label: '优先级', type: 'select', options: ['低', '中', '高'] },
      { id: 'notes', label: '备注', type: 'text' }
    ],
    rows: []
  }
}

function assertColumn(value: unknown): asserts value is HomeTaskColumn {
  if (!value || typeof value !== 'object') throw new HomeError('INVALID_INPUT', '任务列格式无效。')
  const column = value as Record<string, unknown>
  if (typeof column.id !== 'string' || !VALID_ID.test(column.id)) throw new HomeError('INVALID_INPUT', '任务列标识无效。')
  if (typeof column.label !== 'string' || !column.label.trim() || column.label.length > MAX_LABEL_LENGTH) throw new HomeError('INVALID_INPUT', '任务列名称无效。')
  if (column.type !== 'text' && column.type !== 'date' && column.type !== 'select') throw new HomeError('INVALID_INPUT', '任务列类型无效。')
  if (column.type === 'select') {
    if (!Array.isArray(column.options) || column.options.length === 0 || column.options.length > 20) throw new HomeError('INVALID_INPUT', '任务列选项无效。')
    for (const option of column.options) {
      if (typeof option !== 'string' || !option.trim() || option.length > MAX_LABEL_LENGTH) throw new HomeError('INVALID_INPUT', '任务列选项无效。')
    }
  } else if (column.options !== undefined) {
    throw new HomeError('INVALID_INPUT', '非下拉列不能包含选项。')
  }
}

function assertRow(value: unknown, columnIds: ReadonlySet<string>): asserts value is HomeTaskRow {
  if (!value || typeof value !== 'object') throw new HomeError('INVALID_INPUT', '任务行格式无效。')
  const row = value as Record<string, unknown>
  if (typeof row.id !== 'string' || !VALID_ID.test(row.id)) throw new HomeError('INVALID_INPUT', '任务行标识无效。')
  if (typeof row.createdAt !== 'string' || !Number.isFinite(Date.parse(row.createdAt))) throw new HomeError('INVALID_INPUT', '任务创建时间无效。')
  if (typeof row.updatedAt !== 'string' || !Number.isFinite(Date.parse(row.updatedAt))) throw new HomeError('INVALID_INPUT', '任务更新时间无效。')
  if (!row.cells || typeof row.cells !== 'object' || Array.isArray(row.cells)) throw new HomeError('INVALID_INPUT', '任务单元格格式无效。')
  for (const [columnId, content] of Object.entries(row.cells as Record<string, unknown>)) {
    if (!columnIds.has(columnId) || typeof content !== 'string' || content.length > MAX_CELL_LENGTH) throw new HomeError('INVALID_INPUT', '任务单元格内容无效。')
  }
}

export function assertTaskTable(value: unknown): asserts value is HomeTaskTable {
  if (!value || typeof value !== 'object') throw new HomeError('INVALID_INPUT', '任务表格格式无效。')
  const table = value as Record<string, unknown>
  if (table.version !== 1 || !Array.isArray(table.columns) || !Array.isArray(table.rows)) throw new HomeError('INVALID_INPUT', '任务表格版本无效。')
  if (table.columns.length === 0 || table.columns.length > MAX_COLUMNS || table.rows.length > MAX_ROWS) throw new HomeError('INVALID_INPUT', '任务表格大小无效。')

  const columnIds = new Set<string>()
  for (const column of table.columns) {
    assertColumn(column)
    if (columnIds.has(column.id)) throw new HomeError('INVALID_INPUT', '任务列标识重复。')
    columnIds.add(column.id)
  }
  const rowIds = new Set<string>()
  for (const row of table.rows) {
    assertRow(row, columnIds)
    if (rowIds.has(row.id)) throw new HomeError('INVALID_INPUT', '任务行标识重复。')
    rowIds.add(row.id)
  }
}

function cloneTable(table: HomeTaskTable): HomeTaskTable {
  return {
    version: 1,
    columns: table.columns.map((column) => ({ ...column, ...(column.options ? { options: [...column.options] } : {}) })),
    rows: table.rows.map((row) => ({ ...row, cells: { ...row.cells } }))
  }
}

export class HomeTaskStore {
  private saveQueue: Promise<void> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  async get(): Promise<HomeTaskTable> {
    await this.saveQueue.catch(() => undefined)
    let content: string
    try {
      content = await readFile(this.filePath, 'utf8')
    } catch (reason) {
      if (reason && typeof reason === 'object' && 'code' in reason && reason.code === 'ENOENT') return createDefaultTaskTable()
      throw new HomeError('TASK_READ_FAILED', '任务记录读取失败。')
    }
    try {
      const table: unknown = JSON.parse(content)
      assertTaskTable(table)
      return cloneTable(table)
    } catch (reason) {
      if (reason instanceof HomeError && reason.code === 'TASK_READ_FAILED') throw reason
      throw new HomeError('TASK_READ_FAILED', '任务记录格式损坏，请先备份或修复数据文件。')
    }
  }

  async save(value: unknown): Promise<HomeTaskTable> {
    assertTaskTable(value)
    const table = cloneTable(value)
    const content = `${JSON.stringify(table, null, 2)}\n`
    const operation = this.saveQueue.catch(() => undefined).then(() => this.writeAtomically(content))
    this.saveQueue = operation
    try {
      await operation
      return cloneTable(table)
    } catch {
      throw new HomeError('TASK_SAVE_FAILED', '任务记录保存失败，请重试。')
    }
  }

  private async writeAtomically(content: string): Promise<void> {
    const temporary = `${this.filePath}.${process.pid}-${randomUUID()}.tmp`
    try {
      await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      await rename(temporary, this.filePath)
      await chmod(this.filePath, 0o600).catch(() => undefined)
    } finally {
      await unlink(temporary).catch(() => undefined)
    }
  }
}

export function createHomeTaskStore(): HomeTaskStore {
  return new HomeTaskStore(path.join(getHomeConfigRoot(), 'home-tasks.json'))
}
