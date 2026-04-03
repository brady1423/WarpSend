import { app, BrowserWindow, ipcMain, shell, dialog, Tray, Menu, Notification, nativeImage } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'
import { getOrCreateDeviceKeys, getDeviceShortId, setDeviceName, closeDatabase } from './services/key-manager'
import { setAllFriendsOffline } from './services/friends-db'
import { TunnelManager } from './services/tunnel-manager'
import { registerFriendsIpc, reconnectAllFriends } from './ipc/friends.ipc'
import { updateFriendOnlineStatus } from './services/friends-db'
import { TransferEngine } from './services/transfer-engine'
import { registerTransferIpc } from './ipc/transfer.ipc'
import { QueueManager } from './services/queue-manager'

let mainWindow: BrowserWindow | null = null
let tunnelManager: TunnelManager | null = null
let transferEngine: TransferEngine | null = null
let queueManager: QueueManager | null = null
let tray: Tray | null = null
let isQuitting = false

// ── Single Instance Lock ──────────────────────────────────────────

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
}

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.show()
    mainWindow.focus()
  }
})

// ── Window ────────────────────────────────────────────────────────

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 670,
    minWidth: 720,
    minHeight: 500,
    show: false,
    backgroundColor: '#1a1a2e',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1a2e',
      symbolColor: '#94a3b8',
      height: 36
    },
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // Minimize to tray on close (don't quit)
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// ── System Tray ───────────────────────────────────────────────────

function createTray(): void {
  // Create a simple 16x16 tray icon (teal circle on transparent bg)
  const icon = nativeImage.createFromBuffer(createTrayIconBuffer())
  tray = new Tray(icon)
  tray.setToolTip('WarpSend')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Open WarpSend',
      click: () => {
        mainWindow?.show()
        mainWindow?.focus()
      }
    },
    { type: 'separator' },
    {
      label: 'Quit',
      click: () => {
        isQuitting = true
        app.quit()
      }
    }
  ])

  tray.setContextMenu(contextMenu)

  tray.on('click', () => {
    mainWindow?.show()
    mainWindow?.focus()
  })
}

/**
 * Generate a tiny tray icon programmatically (16x16 PNG with a teal dot).
 */
function createTrayIconBuffer(): Buffer {
  // Minimal 16x16 RGBA pixel data — teal (#2dd4bf) circle on transparent
  const size = 16
  const data = Buffer.alloc(size * size * 4, 0) // RGBA, all transparent

  const cx = 8, cy = 8, r = 6
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - cx, dy = y - cy
      if (dx * dx + dy * dy <= r * r) {
        const offset = (y * size + x) * 4
        data[offset] = 0x2d     // R
        data[offset + 1] = 0xd4 // G
        data[offset + 2] = 0xbf // B
        data[offset + 3] = 0xff // A
      }
    }
  }

  return nativeImage.createFromBuffer(
    data, { width: size, height: size }
  ).toPNG()
}

// ── Notifications ─────────────────────────────────────────────────

function showNotification(title: string, body: string): void {
  if (Notification.isSupported()) {
    const notification = new Notification({ title, body })
    notification.on('click', () => {
      mainWindow?.show()
      mainWindow?.focus()
    })
    notification.show()
  }
}

// ── Services ──────────────────────────────────────────────────────

function initializeTunnelManager(): void {
  const device = getOrCreateDeviceKeys()
  tunnelManager = new TunnelManager(device.privateKey)

  tunnelManager.on('friend-online', (friendId: string) => {
    updateFriendOnlineStatus(friendId, true)
    mainWindow?.webContents.send('tunnel:friend-status', {
      friendId,
      status: 'online'
    })
  })

  tunnelManager.on('friend-offline', (friendId: string) => {
    updateFriendOnlineStatus(friendId, false)
    mainWindow?.webContents.send('tunnel:friend-status', {
      friendId,
      status: 'offline'
    })
  })

  transferEngine = new TransferEngine(tunnelManager)
  queueManager = new QueueManager(transferEngine, tunnelManager)

  // Show notifications for incoming transfers
  transferEngine.on('incoming-transfer', (request: { fileName: string; fileSize: number }) => {
    const sizeMB = (request.fileSize / (1024 * 1024)).toFixed(1)
    showNotification(
      'Incoming Transfer',
      `Someone wants to send you ${request.fileName} (${sizeMB} MB)`
    )
  })

  transferEngine.on('transfer-complete', (_id: string, direction: string) => {
    if (direction === 'receiving') {
      showNotification('Transfer Complete', 'File received successfully')
    }
  })
}

// ── IPC Handlers ──────────────────────────────────────────────────

ipcMain.handle('app:get-device-info', () => {
  const device = getOrCreateDeviceKeys()
  return {
    name: device.deviceName,
    id: getDeviceShortId(),
    publicKey: device.publicKey
  }
})

ipcMain.handle('app:set-device-name', (_event, name: string) => {
  setDeviceName(name)
  return { success: true }
})

ipcMain.handle('dialog:open-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile', 'multiSelections']
  })
  return result.canceled ? [] : result.filePaths
})

ipcMain.handle('dialog:open-folder', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory']
  })
  return result.canceled ? null : result.filePaths[0]
})

ipcMain.handle('settings:get-start-on-boot', () => {
  return app.getLoginItemSettings().openAtLogin
})

ipcMain.handle('settings:set-start-on-boot', (_event, enabled: boolean) => {
  app.setLoginItemSettings({
    openAtLogin: enabled,
    openAsHidden: true
  })
  return { success: true }
})

// ── Queue IPC ─────────────────────────────────────────────────────

ipcMain.handle('queue:list', (_event, friendId?: string) => {
  if (!queueManager) return { success: false, error: 'Not initialized' }
  return { success: true, items: queueManager.getQueue(friendId) }
})

ipcMain.handle('queue:enqueue', (_event, friendId: string, filePaths: string[]) => {
  if (!queueManager) return { success: false, error: 'Not initialized' }
  const items = queueManager.enqueue(friendId, filePaths)
  return { success: true, items }
})

ipcMain.handle('queue:cancel', (_event, queueId: string) => {
  if (!queueManager) return { success: false, error: 'Not initialized' }
  queueManager.cancel(queueId)
  return { success: true }
})

ipcMain.handle('queue:counts', () => {
  if (!queueManager) return { success: false, error: 'Not initialized' }
  return { success: true, counts: queueManager.getQueueCounts() }
})

// ── App Lifecycle ──────────────────────────────────────────────────

app.whenReady().then(() => {
  setAllFriendsOffline()
  initializeTunnelManager()
  registerFriendsIpc(tunnelManager!)
  registerTransferIpc(transferEngine!, () => mainWindow)
  createWindow()

  // Try to reconnect to all saved friends after a short delay
  setTimeout(() => {
    reconnectAllFriends(tunnelManager!)
  }, 2000)
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // Don't quit on window close — keep running in tray
  if (process.platform !== 'darwin') {
    // On Windows/Linux, the tray keeps the app running
  }
})

app.on('before-quit', () => {
  isQuitting = true
  tunnelManager?.shutdown()
  closeDatabase()
  tray?.destroy()
})
