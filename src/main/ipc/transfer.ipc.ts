/**
 * Transfer IPC handlers — bridge between renderer and transfer engine.
 */

import { ipcMain, BrowserWindow, dialog } from 'electron'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { TransferEngine } from '../services/transfer-engine'

export function registerTransferIpc(
  transferEngine: TransferEngine,
  getMainWindow: () => BrowserWindow | null
): void {
  // Send file(s) to a friend
  ipcMain.handle('transfer:send', async (_event, friendId: string, filePaths: string[]) => {
    try {
      const transfers = []
      for (const filePath of filePaths) {
        const transfer = await transferEngine.initiateTransfer(friendId, filePath)
        transfers.push({
          transferId: transfer.transferId,
          fileName: transfer.fileName,
          fileSize: transfer.fileSize
        })
      }
      return { success: true, transfers }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // Send text as a temporary .txt file
  ipcMain.handle('transfer:send-text', async (_event, friendId: string, text: string) => {
    try {
      const tmpDir = path.join(os.tmpdir(), 'warpsend-text')
      fs.mkdirSync(tmpDir, { recursive: true })
      const tmpFile = path.join(tmpDir, `message-${Date.now()}.txt`)
      fs.writeFileSync(tmpFile, text, 'utf-8')
      const transfer = await transferEngine.initiateTransfer(friendId, tmpFile)
      return {
        success: true,
        transfer: {
          transferId: transfer.transferId,
          fileName: transfer.fileName,
          fileSize: transfer.fileSize
        }
      }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // Accept an incoming transfer
  ipcMain.handle('transfer:accept', (_event, transferId: string) => {
    try {
      transferEngine.acceptTransfer(transferId)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // Accept with a custom save path (Save As)
  ipcMain.handle('transfer:accept-with-path', async (_event, transferId: string) => {
    try {
      const win = getMainWindow()
      if (!win) return { success: false, error: 'No window' }
      const result = await dialog.showSaveDialog(win, {
        defaultPath: transferEngine.getTransferFileName(transferId) || 'file'
      })
      if (result.canceled || !result.filePath) {
        return { success: false, error: 'Cancelled' }
      }
      transferEngine.acceptTransfer(transferId, result.filePath)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // Decline an incoming transfer
  ipcMain.handle('transfer:decline', (_event, transferId: string) => {
    try {
      transferEngine.declineTransfer(transferId)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // Cancel an active transfer
  ipcMain.handle('transfer:cancel', (_event, transferId: string) => {
    try {
      transferEngine.cancelTransfer(transferId)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // Get active transfers
  ipcMain.handle('transfer:active', () => {
    return { success: true, transfers: transferEngine.getActiveTransfers() }
  })

  // Forward progress events to the renderer
  transferEngine.on('progress', (progress) => {
    getMainWindow()?.webContents.send('transfer:progress', progress)
  })

  // Forward incoming transfer requests to the renderer
  transferEngine.on('incoming-transfer', (request) => {
    getMainWindow()?.webContents.send('transfer:incoming', request)
  })

  // Forward transfer completion
  transferEngine.on('transfer-complete', (transferId: string, direction: string) => {
    getMainWindow()?.webContents.send('transfer:completed', { transferId, direction })
  })

  // Forward transfer failures to renderer
  transferEngine.on('transfer-failed', (transferId: string, reason: string) => {
    getMainWindow()?.webContents.send('transfer:failed', { transferId, reason })
  })

  // Forward transfer cancellations
  transferEngine.on('transfer-cancelled', (transferId: string) => {
    getMainWindow()?.webContents.send('transfer:cancelled', { transferId })
  })

  // Forward transfer decline
  transferEngine.on('transfer-declined', (transferId: string) => {
    getMainWindow()?.webContents.send('transfer:declined', { transferId })
  })
}
