/**
 * Queue Manager — Handles offline file transfer queueing.
 *
 * When a friend is offline, files are added to a persistent queue.
 * When the friend comes online, queued transfers auto-initiate.
 */

import { v4 as uuidv4 } from 'uuid'
import fs from 'fs'
import path from 'path'
import { getDatabase } from './key-manager'
import { TransferEngine } from './transfer-engine'
import { TunnelManager } from './tunnel-manager'

export interface QueuedItem {
  id: string
  friendId: string
  filePath: string
  fileName: string
  fileSize: number
  status: 'queued' | 'transferring' | 'completed' | 'failed' | 'cancelled'
  chunksSent: number
  totalChunks: number
  createdAt: string
  completedAt: string | null
}

export class QueueManager {
  private transferEngine: TransferEngine
  private tunnelManager: TunnelManager
  private processing = new Set<string>() // friend IDs currently being processed

  constructor(transferEngine: TransferEngine, tunnelManager: TunnelManager) {
    this.transferEngine = transferEngine
    this.tunnelManager = tunnelManager

    // Listen for friends coming online
    tunnelManager.on('friend-online', (friendId: string) => {
      this.onFriendOnline(friendId)
    })

    // Listen for friends going offline
    tunnelManager.on('friend-offline', (friendId: string) => {
      this.onFriendOffline(friendId)
    })

    // Reset any "transferring" items to "queued" on startup
    this.resetInterruptedTransfers()
  }

  /**
   * Add file(s) to the queue for a friend.
   * If the friend is online, initiates transfer immediately.
   */
  enqueue(friendId: string, filePaths: string[]): QueuedItem[] {
    const db = getDatabase()
    const items: QueuedItem[] = []

    for (const filePath of filePaths) {
      const stat = fs.statSync(filePath)
      const item: QueuedItem = {
        id: uuidv4(),
        friendId,
        filePath,
        fileName: path.basename(filePath),
        fileSize: stat.size,
        status: 'queued',
        chunksSent: 0,
        totalChunks: Math.ceil(stat.size / (64 * 1024)),
        createdAt: new Date().toISOString(),
        completedAt: null
      }

      db.prepare(`
        INSERT INTO transfer_queue (id, friend_id, file_path, file_name, file_size, status, chunks_sent, total_chunks, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        item.id, item.friendId, item.filePath, item.fileName,
        item.fileSize, item.status, item.chunksSent, item.totalChunks, item.createdAt
      )

      items.push(item)
    }

    // If friend is online, start processing immediately
    const isOnline = this.tunnelManager.getConnectionState(friendId) === 'connected'
    if (isOnline) {
      this.processQueue(friendId)
    }

    return items
  }

  /**
   * Cancel a queued transfer.
   */
  cancel(queueId: string): void {
    const db = getDatabase()
    db.prepare("UPDATE transfer_queue SET status = 'cancelled' WHERE id = ?").run(queueId)
  }

  /**
   * Clear all queued transfers for a friend.
   */
  clearForFriend(friendId: string): void {
    const db = getDatabase()
    db.prepare("UPDATE transfer_queue SET status = 'cancelled' WHERE friend_id = ? AND status = 'queued'")
      .run(friendId)
  }

  /**
   * Get all queued items, optionally filtered by friend.
   */
  getQueue(friendId?: string): QueuedItem[] {
    const db = getDatabase()
    if (friendId) {
      return db.prepare(
        "SELECT * FROM transfer_queue WHERE friend_id = ? AND status IN ('queued', 'transferring') ORDER BY created_at"
      ).all(friendId) as QueuedItem[]
    }
    return db.prepare(
      "SELECT * FROM transfer_queue WHERE status IN ('queued', 'transferring') ORDER BY created_at"
    ).all() as QueuedItem[]
  }

  /**
   * Get queue count per friend (for UI badges).
   */
  getQueueCounts(): Record<string, number> {
    const db = getDatabase()
    const rows = db.prepare(
      "SELECT friend_id, COUNT(*) as count FROM transfer_queue WHERE status = 'queued' GROUP BY friend_id"
    ).all() as { friend_id: string; count: number }[]

    const counts: Record<string, number> = {}
    for (const row of rows) {
      counts[row.friend_id] = row.count
    }
    return counts
  }

  /**
   * Called when a friend comes online — process their queue.
   */
  private async onFriendOnline(friendId: string): Promise<void> {
    this.processQueue(friendId)
  }

  /**
   * Called when a friend goes offline — pause any active queue transfers.
   */
  private onFriendOffline(friendId: string): void {
    this.processing.delete(friendId)
    // Reset any "transferring" items back to "queued"
    const db = getDatabase()
    db.prepare(
      "UPDATE transfer_queue SET status = 'queued' WHERE friend_id = ? AND status = 'transferring'"
    ).run(friendId)
  }

  /**
   * Process queued items for a friend, one at a time.
   */
  private async processQueue(friendId: string): Promise<void> {
    if (this.processing.has(friendId)) return
    this.processing.add(friendId)

    const db = getDatabase()

    while (this.processing.has(friendId)) {
      // Get next queued item
      const item = db.prepare(
        "SELECT * FROM transfer_queue WHERE friend_id = ? AND status = 'queued' ORDER BY created_at LIMIT 1"
      ).get(friendId) as QueuedItem | undefined

      if (!item) {
        this.processing.delete(friendId)
        break
      }

      // Check file still exists
      if (!fs.existsSync(item.file_path ?? item.filePath)) {
        db.prepare("UPDATE transfer_queue SET status = 'failed' WHERE id = ?").run(item.id)
        continue
      }

      // Mark as transferring
      db.prepare("UPDATE transfer_queue SET status = 'transferring' WHERE id = ?").run(item.id)

      try {
        // Initiate the actual transfer via the transfer engine
        await this.transferEngine.initiateTransfer(
          friendId,
          item.file_path ?? item.filePath
        )

        // Wait for transfer to complete (simplified — in production, use proper event handling)
        db.prepare(
          "UPDATE transfer_queue SET status = 'completed', completed_at = ? WHERE id = ?"
        ).run(new Date().toISOString(), item.id)
      } catch {
        // Transfer failed — leave as queued for retry
        db.prepare("UPDATE transfer_queue SET status = 'queued' WHERE id = ?").run(item.id)
        this.processing.delete(friendId)
        break
      }
    }
  }

  /**
   * Reset interrupted transfers (from previous app session).
   */
  private resetInterruptedTransfers(): void {
    const db = getDatabase()
    db.prepare("UPDATE transfer_queue SET status = 'queued' WHERE status = 'transferring'").run()
  }
}
