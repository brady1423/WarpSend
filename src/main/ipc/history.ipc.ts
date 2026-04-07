/**
 * History IPC handlers — bridge between renderer and transfer history database.
 * Also handles file preview operations (read text, read as data URL, open in folder).
 */

import { ipcMain, shell } from 'electron'
import fs from 'fs'
import path from 'path'
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

  // Read first 10KB of a text file for preview
  ipcMain.handle('file:read-text-preview', (_event, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) return { success: false, error: 'File not found' }
      const stat = fs.statSync(filePath)
      const content = fs.readFileSync(filePath, 'utf-8').substring(0, 10000)
      return { success: true, content, totalSize: stat.size }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // Read a file as a base64 data URL (for audio/image preview)
  ipcMain.handle('file:read-as-data-url', (_event, filePath: string) => {
    try {
      if (!fs.existsSync(filePath)) return { success: false, error: 'File not found' }
      const stat = fs.statSync(filePath)
      const maxSize = 50 * 1024 * 1024 // 50MB
      if (stat.size > maxSize) return { success: false, error: 'File too large for preview' }

      const ext = path.extname(filePath).toLowerCase()
      const mimeMap: Record<string, string> = {
        '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
        '.gif': 'image/gif', '.webp': 'image/webp', '.bmp': 'image/bmp',
        '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
        '.flac': 'audio/flac', '.aac': 'audio/aac', '.m4a': 'audio/mp4',
        '.wma': 'audio/x-ms-wma'
      }
      const mime = mimeMap[ext] || 'application/octet-stream'
      const data = fs.readFileSync(filePath)
      const dataUrl = `data:${mime};base64,${data.toString('base64')}`
      return { success: true, dataUrl }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // Show file in system file explorer
  ipcMain.handle('file:open-in-folder', (_event, filePath: string) => {
    try {
      shell.showItemInFolder(filePath)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
