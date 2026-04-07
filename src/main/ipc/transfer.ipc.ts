/**
 * Transfer IPC handlers — bridge between renderer and transfer engine.
 */

import { ipcMain, BrowserWindow, dialog } from 'electron'
import { v4 as uuidv4 } from 'uuid'
import { TransferEngine } from '../services/transfer-engine'
import { TunnelManager } from '../services/tunnel-manager'
import type { TextMessage } from '../services/protocol'

export function registerTransferIpc(
  transferEngine: TransferEngine,
  getMainWindow: () => BrowserWindow | null,
  tunnelManager: TunnelManager
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

  // Send text as an inline control message (no file creation)
  ipcMain.handle('transfer:send-text', async (_event, friendId: string, text: string) => {
    try {
      const messageId = uuidv4()
      const message: TextMessage = {
        type: 'TEXT_MESSAGE',
        messageId,
        text,
        timestamp: Date.now()
      }
      if (text.length > 10000) {
        return { success: false, error: 'Message too long (max 10,000 characters)' }
      }
      tunnelManager.sendControl(friendId, message)
      return { success: true, messageId }
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
  transferEngine.on('transfer-complete', (transferId: string, direction: string, _friendId: string, fileName: string, _fileSize: number, filePath: string) => {
    getMainWindow()?.webContents.send('transfer:completed', { transferId, direction, fileName, filePath })
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
