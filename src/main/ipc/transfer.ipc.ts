/**
 * Transfer IPC handlers — bridge between renderer and transfer engine.
 */

import { ipcMain, BrowserWindow } from 'electron'
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

  // Accept an incoming transfer
  ipcMain.handle('transfer:accept', (_event, transferId: string) => {
    try {
      transferEngine.acceptTransfer(transferId)
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
}
