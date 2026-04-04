/**
 * Transfer history database operations — logs completed and failed transfers.
 */

import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from './key-manager'

export interface TransferHistoryRow {
  id: string
  friend_id: string
  file_name: string
  file_size: number
  direction: string
  status: string
  created_at: string
  completed_at: string | null
}

export interface TransferHistoryEntry {
  id: string
  friendId: string
  fileName: string
  fileSize: number
  direction: 'sending' | 'receiving'
  status: string
  createdAt: string
  completedAt: string | null
}

function rowToEntry(row: TransferHistoryRow): TransferHistoryEntry {
  return {
    id: row.id,
    friendId: row.friend_id,
    fileName: row.file_name,
    fileSize: row.file_size,
    direction: row.direction as 'sending' | 'receiving',
    status: row.status,
    createdAt: row.created_at,
    completedAt: row.completed_at
  }
}

export function addTransferHistory(
  friendId: string,
  fileName: string,
  fileSize: number,
  direction: 'sending' | 'receiving',
  status: string
): TransferHistoryEntry {
  const db = getDatabase()
  const id = uuidv4()
  const now = new Date().toISOString()

  db.prepare(
    `INSERT INTO transfer_history (id, friend_id, file_name, file_size, direction, status, created_at, completed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, friendId, fileName, fileSize, direction, status, now, status === 'completed' ? now : null)

  return { id, friendId, fileName, fileSize, direction, status, createdAt: now, completedAt: status === 'completed' ? now : null }
}

export function getTransferHistory(friendId?: string): TransferHistoryEntry[] {
  const db = getDatabase()
  if (friendId) {
    const rows = db.prepare(
      'SELECT * FROM transfer_history WHERE friend_id = ? ORDER BY created_at DESC LIMIT 100'
    ).all(friendId) as TransferHistoryRow[]
    return rows.map(rowToEntry)
  }
  const rows = db.prepare(
    'SELECT * FROM transfer_history ORDER BY created_at DESC LIMIT 100'
  ).all() as TransferHistoryRow[]
  return rows.map(rowToEntry)
}

export function clearTransferHistory(friendId?: string): void {
  const db = getDatabase()
  if (friendId) {
    db.prepare('DELETE FROM transfer_history WHERE friend_id = ?').run(friendId)
  } else {
    db.prepare('DELETE FROM transfer_history').run()
  }
}
