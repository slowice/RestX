import { randomUUID } from 'node:crypto'
import { chmod, lstat, mkdir, readFile, readdir, rename, rm, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { MAX_SKILL_FILE_BYTES, type FrequentSkill, type FrequentSkillDraft, type FrequentSkillList } from '../../shared/contracts'
import { FrequentSkillsError } from './frequent-skills-error'
import { assertSkillId, normalizeSkillDraft, parseSkillMarkdown, serializeSkillMarkdown } from './skill-markdown'

const SKILL_FILE = 'SKILL.md'

async function statOrNull(target: string): Promise<Awaited<ReturnType<typeof lstat>> | null> {
  try {
    return await lstat(target)
  } catch (reason) {
    if (reason && typeof reason === 'object' && 'code' in reason && reason.code === 'ENOENT') return null
    throw reason
  }
}

function slugFromName(name: string): string {
  const slug = name.toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  return slug || 'skill'
}

export class SkillStore {
  constructor(readonly root: string, private readonly now: () => Date = () => new Date()) {
    if (!path.isAbsolute(root)) throw new FrequentSkillsError('STORAGE_FAILED', 'Skill 存储目录配置无效。')
  }

  async list(): Promise<FrequentSkillList> {
    await this.ensureRoot()
    const entries = await readdir(this.root, { withFileTypes: true })
    const skills: FrequentSkill[] = []
    let invalidCount = 0
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) {
        invalidCount += 1
        continue
      }
      try {
        skills.push(await this.readEntry(entry.name))
      } catch {
        invalidCount += 1
      }
    }
    skills.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt) || left.name.localeCompare(right.name))
    return { skills, invalidCount }
  }

  async get(id: string): Promise<FrequentSkill> {
    assertSkillId(id)
    await this.ensureRoot()
    const directory = this.skillDirectory(id)
    const directoryStat = await statOrNull(directory)
    if (!directoryStat) throw new FrequentSkillsError('SKILL_NOT_FOUND', 'Skill 不存在或已被删除。')
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new FrequentSkillsError('INVALID_SKILL_FILE', 'Skill 文件格式无效。')
    }
    return this.readEntry(id)
  }

  async create(input: FrequentSkillDraft): Promise<FrequentSkill> {
    const draft = normalizeSkillDraft(input)
    await this.ensureRoot()
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const id = `${slugFromName(draft.name)}-${randomUUID().slice(0, 8)}`
      const directory = this.skillDirectory(id)
      try {
        await mkdir(directory, { mode: 0o700 })
      } catch (reason) {
        if (reason && typeof reason === 'object' && 'code' in reason && reason.code === 'EEXIST') continue
        throw new FrequentSkillsError('STORAGE_FAILED', '无法创建 Skill。')
      }
      const timestamp = this.now().toISOString()
      const skill: FrequentSkill = {
        schemaVersion: 1,
        id,
        ...draft,
        createdAt: timestamp,
        updatedAt: timestamp
      }
      try {
        await this.writeAtomically(path.join(directory, SKILL_FILE), serializeSkillMarkdown(skill))
        return skill
      } catch (reason) {
        await rm(directory, { recursive: true, force: true }).catch(() => undefined)
        if (reason instanceof FrequentSkillsError) throw reason
        throw new FrequentSkillsError('STORAGE_FAILED', '无法创建 Skill。')
      }
    }
    throw new FrequentSkillsError('STORAGE_FAILED', '无法生成可用的 Skill 标识。')
  }

  async update(id: string, input: FrequentSkillDraft): Promise<FrequentSkill> {
    const current = await this.get(id)
    const draft = normalizeSkillDraft(input)
    const requestedUpdate = this.now().getTime()
    const currentUpdate = new Date(current.updatedAt).getTime()
    const updatedAt = new Date(Math.max(requestedUpdate, currentUpdate + 1)).toISOString()
    const skill = { ...current, ...draft, updatedAt }
    try {
      await this.writeAtomically(path.join(this.skillDirectory(id), SKILL_FILE), serializeSkillMarkdown(skill))
      return skill
    } catch (reason) {
      if (reason instanceof FrequentSkillsError) throw reason
      throw new FrequentSkillsError('STORAGE_FAILED', '无法保存 Skill。')
    }
  }

  async importSkill(source: FrequentSkill): Promise<FrequentSkill> {
    return this.create({ name: source.name, description: source.description, prompt: source.prompt })
  }

  async directoryForDelete(id: string): Promise<string> {
    await this.get(id)
    return this.skillDirectory(id)
  }

  private skillDirectory(id: string): string {
    assertSkillId(id)
    const target = path.resolve(this.root, id)
    if (path.dirname(target) !== path.resolve(this.root)) {
      throw new FrequentSkillsError('INVALID_INPUT', 'Skill 标识无效。')
    }
    return target
  }

  private async ensureRoot(): Promise<void> {
    const current = await statOrNull(this.root)
    if (current?.isSymbolicLink() || (current && !current.isDirectory())) {
      throw new FrequentSkillsError('STORAGE_FAILED', 'Skill 存储目录不可用。')
    }
    if (!current) await mkdir(this.root, { recursive: true, mode: 0o700 })
    await chmod(this.root, 0o700).catch(() => undefined)
  }

  private async readEntry(id: string): Promise<FrequentSkill> {
    assertSkillId(id)
    const directory = this.skillDirectory(id)
    const directoryStat = await lstat(directory)
    if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) {
      throw new FrequentSkillsError('INVALID_SKILL_FILE', 'Skill 文件格式无效。')
    }
    const file = path.join(directory, SKILL_FILE)
    const fileStat = await lstat(file)
    if (!fileStat.isFile() || fileStat.isSymbolicLink() || fileStat.size > MAX_SKILL_FILE_BYTES) {
      throw new FrequentSkillsError('INVALID_SKILL_FILE', 'Skill 文件格式无效。')
    }
    const skill = parseSkillMarkdown(await readFile(file, 'utf8'))
    if (skill.id !== id) throw new FrequentSkillsError('INVALID_SKILL_FILE', 'Skill 文件格式无效。')
    return skill
  }

  private async writeAtomically(target: string, content: string): Promise<void> {
    const temporary = `${target}.${process.pid}-${randomUUID()}.tmp`
    try {
      await writeFile(temporary, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' })
      await rename(temporary, target)
      await chmod(target, 0o600).catch(() => undefined)
    } finally {
      await unlink(temporary).catch(() => undefined)
    }
  }
}
