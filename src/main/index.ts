import { app, BrowserWindow } from 'electron'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { createRestxStorageLayout, initializeRestxStorage } from '../platform/main/storage'

const applicationName = 'RestX'
const developmentIcon = process.env.ELECTRON_RENDERER_URL
  ? path.join(__dirname, '../../build/icon.png')
  : undefined

app.setName(applicationName)
const legacyUserData = app.getPath('userData')
const storageLayout = createRestxStorageLayout()
mkdirSync(storageLayout.runtime, { recursive: true, mode: 0o700 })
app.setPath('userData', storageLayout.runtime)

let disposeApplication: (() => void) | null = null

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1240,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: applicationName,
    ...(developmentIcon ? { icon: developmentIcon } : {}),
    backgroundColor: '#ffffff',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    void window.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    void window.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(async () => {
  if (process.platform === 'win32') app.setAppUserModelId('com.restx.desktop')
  if (process.platform === 'darwin' && developmentIcon) app.dock?.setIcon(developmentIcon)

  await initializeRestxStorage({ legacyUserData })
  const { registerApplication } = await import('../platform/main/register-platform')
  disposeApplication = await registerApplication()
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
}).catch((reason: unknown) => {
  const message = reason instanceof Error ? reason.message : '未知启动错误'
  console.error(`RestX startup failed: ${message}`)
  app.quit()
})

app.once('will-quit', () => {
  disposeApplication?.()
  disposeApplication = null
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
