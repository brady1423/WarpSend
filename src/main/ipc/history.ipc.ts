/**
 * History IPC handlers — bridge between renderer and transfer history database.
 */

import { ipcMain } from 'electron'
import { getTransferHistory, clearTransferHistory } from '../services/transfer-history-db'

export function registerHistoryIpc(): void {
  ipcMain.handle('history:list', (_event, friendId?: string) => {
    try {
      return { success: true, history: getTransferHistory(friendId) }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  ipcMain.handle('history:clear', (_event, friendId?: string) => {
    try {
      clearTransferHistory(friendId)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
