import { execFile } from 'node:child_process'

export type GitEmailReader = () => Promise<string>

function readConfiguredEmail(): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile('git', ['config', '--global', '--get', 'user.email'], {
      encoding: 'utf8',
      timeout: 3_000,
      windowsHide: true
    }, (error, stdout) => {
      if (error) reject(error)
      else resolve(stdout)
    })
  })
}

export async function readGlobalGitEmail(reader: GitEmailReader = readConfiguredEmail): Promise<string | null> {
  try {
    const email = (await reader()).trim()
    return email && email.length <= 320 && email.includes('@') ? email : null
  } catch {
    return null
  }
}
