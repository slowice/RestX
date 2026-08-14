export type RevealFileStat = {
  isFile(): boolean
}

export type RevealFileDependencies = {
  assertAuthorized(path: string): Promise<string>
  lstat(path: string): Promise<RevealFileStat>
  showItemInFolder(path: string): void
}

export async function revealAuthorizedFile(filePath: string, dependencies: RevealFileDependencies): Promise<void> {
  const resolved = await dependencies.assertAuthorized(filePath)
  let stat: RevealFileStat
  try {
    stat = await dependencies.lstat(resolved)
  } catch {
    throw new Error('文件不存在或已被移动，请重新扫描后再试。')
  }
  if (!stat.isFile()) throw new Error('只能打开文件所在位置。')
  dependencies.showItemInFolder(resolved)
}
