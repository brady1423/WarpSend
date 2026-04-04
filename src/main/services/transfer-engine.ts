/**
 * Transfer Engine — Chunked file streaming with progress, accept/decline, and resume.
 *
 * Handles both sending and receiving files over encrypted tunnels.
 * Uses the binary protocol defined in protocol.ts for data chunks.
 */

import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { EventEmitter } from 'events'
import { v4 as uuidv4 } from 'uuid'
import { app } from 'electron'
import { TunnelManager } from './tunnel-manager'
import {
  CHUNK_SIZE,
  encodeChunk,
  decodeChunk,
  type ControlMessage,
  type TransferRequest,
  type TransferAccept,
  type TransferResume,
  type ChunkAck
} from './protocol'

export interface ActiveTransfer {
  transferId: string
  friendId: string
  fileName: string
  filePath: string
  fileSize: number
  direction: 'sending' | 'receiving'
  status: 'pending' | 'active' | 'paused' | 'completed' | 'failed' | 'cancelled'
  totalChunks: number
  completedChunks: number
  checksum: string
  startTime: number
  bytesTransferred: number
  // Sender-specific
  readStream?: fs.ReadStream
  windowSize: number
  unackedChunks: Set<number>
  chunkSendTimes: Map<number, number>
  chunkRetryCount: Map<number, number>
  retransmitTimer?: ReturnType<typeof setInterval>
  // Receiver-specific
  writeStream?: fs.WriteStream
  tempPath?: string
  receivedChunks?: Set<number>
}

export interface TransferProgress {
  transferId: string
  friendId: string
  fileName: string
  fileSize: number
  completedChunks: number
  totalChunks: number
  bytesTransferred: number
  speed: number
  direction: 'sending' | 'receiving'
  status: string
}

const WINDOW_SIZE = 8
const ACK_TIMEOUT = 5000
const MAX_RETRIES_PER_CHUNK = 5
const RETRANSMIT_CHECK_INTERVAL = 1000
const PROGRESS_THROTTLE = 250 // ms between progress events

export class TransferEngine extends EventEmitter {
  private tunnelManager: TunnelManager
  private transfers = new Map<string, ActiveTransfer>()
  private lastProgressEmit = new Map<string, number>()
  private downloadFolder: string

  constructor(tunnelManager: TunnelManager) {
    super()
    this.tunnelManager = tunnelManager
    this.downloadFolder = path.join(app.getPath('downloads'), 'WarpSend')
    fs.mkdirSync(this.downloadFolder, { recursive: true })

    // Listen for control messages from the tunnel
    tunnelManager.on('control-message', (friendId: string, message: ControlMessage) => {
      this.handleControlMessage(friendId, message)
    })

    tunnelManager.on('data-message', (friendId: string, data: Buffer) => {
      this.handleDataMessage(friendId, data)
    })
  }

  /**
   * Initiate a file transfer to a friend.
   */
  async initiateTransfer(friendId: string, filePath: string): Promise<ActiveTransfer> {
    const stat = fs.statSync(filePath)
    const fileName = path.basename(filePath)
    const fileSize = stat.size
    const totalChunks = Math.ceil(fileSize / CHUNK_SIZE)
    const transferId = uuidv4()

    // Compute SHA-256 checksum
    const checksum = await this.computeChecksum(filePath)

    const transfer: ActiveTransfer = {
      transferId,
      friendId,
      fileName,
      filePath,
      fileSize,
      direction: 'sending',
      status: 'pending',
      totalChunks,
      completedChunks: 0,
      checksum,
      startTime: Date.now(),
      bytesTransferred: 0,
      windowSize: WINDOW_SIZE,
      unackedChunks: new Set(),
      chunkSendTimes: new Map(),
      chunkRetryCount: new Map()
    }

    this.transfers.set(transferId, transfer)

    // Send transfer request to peer
    const request: TransferRequest = {
      type: 'TRANSFER_REQUEST',
      transferId,
      fileName,
      fileSize,
      fileType: path.extname(fileName).substring(1) || 'unknown',
      checksum
    }

    this.tunnelManager.sendControl(friendId, request)
    this.emitProgress(transfer)
    return transfer
  }

  /**
   * Accept an incoming transfer.
   */
  acceptTransfer(transferId: string, customSavePath?: string): void {
    const transfer = this.transfers.get(transferId)
    if (!transfer || transfer.direction !== 'receiving') return

    transfer.status = 'active'

    // Determine save location
    const saveDir = customSavePath ? path.dirname(customSavePath) : this.downloadFolder
    const saveName = customSavePath ? path.basename(customSavePath) : transfer.fileName
    ;(transfer as any)._customSavePath = customSavePath || null
    ;(transfer as any)._saveName = saveName

    // Create temp file for receiving (fd-based for random-access writes)
    const tempName = `${saveName}.warpsend-partial`
    transfer.tempPath = path.join(saveDir, tempName)
    const fd = fs.openSync(transfer.tempPath, 'w')
    ;(transfer as any)._receiveFd = fd

    // Send accept message
    const accept: TransferAccept = {
      type: 'TRANSFER_ACCEPT',
      transferId
    }
    this.tunnelManager.sendControl(transfer.friendId, accept)
    this.emitProgress(transfer)
  }

  /**
   * Get the file name for a pending transfer (used by Save As dialog).
   */
  getTransferFileName(transferId: string): string | null {
    const transfer = this.transfers.get(transferId)
    return transfer ? transfer.fileName : null
  }

  /**
   * Decline an incoming transfer.
   */
  declineTransfer(transferId: string): void {
    const transfer = this.transfers.get(transferId)
    if (!transfer) return

    transfer.status = 'cancelled'
    this.tunnelManager.sendControl(transfer.friendId, {
      type: 'TRANSFER_DECLINE',
      transferId
    })
    this.cleanup(transferId)
  }

  /**
   * Cancel an active transfer (either direction).
   */
  cancelTransfer(transferId: string): void {
    const transfer = this.transfers.get(transferId)
    if (!transfer) return

    transfer.status = 'cancelled'
    this.tunnelManager.sendControl(transfer.friendId, {
      type: 'TRANSFER_CANCEL',
      transferId
    })
    this.cleanup(transferId)
  }

  /**
   * Handle control messages from peers.
   */
  private handleControlMessage(friendId: string, message: ControlMessage): void {
    switch (message.type) {
      case 'TRANSFER_REQUEST':
        this.handleTransferRequest(friendId, message as TransferRequest)
        break
      case 'TRANSFER_ACCEPT':
        this.handleTransferAccept((message as TransferAccept).transferId)
        break
      case 'TRANSFER_DECLINE':
        this.handleTransferDeclined(message.transferId)
        break
      case 'TRANSFER_CANCEL':
        this.handleTransferCancelled(message.transferId)
        break
      case 'TRANSFER_COMPLETE':
        this.handleTransferComplete(message.transferId)
        break
      case 'TRANSFER_RESUME':
        this.handleTransferResume(message as TransferResume)
        break
      case 'CHUNK_ACK':
        this.handleChunkAck(message as ChunkAck)
        break
    }
  }

  /**
   * Handle incoming transfer request — emit to UI for accept/decline.
   */
  private handleTransferRequest(friendId: string, request: TransferRequest): void {
    const transfer: ActiveTransfer = {
      transferId: request.transferId,
      friendId,
      fileName: request.fileName,
      filePath: '',
      fileSize: request.fileSize,
      direction: 'receiving',
      status: 'pending',
      totalChunks: Math.ceil(request.fileSize / CHUNK_SIZE),
      completedChunks: 0,
      checksum: request.checksum,
      startTime: Date.now(),
      bytesTransferred: 0,
      windowSize: WINDOW_SIZE,
      unackedChunks: new Set(),
      chunkSendTimes: new Map(),
      chunkRetryCount: new Map(),
      receivedChunks: new Set()
    }

    this.transfers.set(request.transferId, transfer)
    this.emit('incoming-transfer', {
      transferId: request.transferId,
      friendId,
      fileName: request.fileName,
      fileSize: request.fileSize,
      fileType: request.fileType
    })
  }

  /**
   * Peer accepted our transfer — start sending chunks.
   */
  private handleTransferAccept(transferId: string): void {
    const transfer = this.transfers.get(transferId)
    if (!transfer || transfer.direction !== 'sending') return

    transfer.status = 'active'
    transfer.startTime = Date.now()
    this.startSending(transfer)
  }

  /**
   * Start streaming chunks to the peer.
   */
  private startSending(transfer: ActiveTransfer): void {
    const fd = fs.openSync(transfer.filePath, 'r')
    let chunkIndex = transfer.completedChunks

    const sendNextChunks = () => {
      while (
        transfer.status === 'active' &&
        transfer.unackedChunks.size < transfer.windowSize &&
        chunkIndex < transfer.totalChunks
      ) {
        const offset = chunkIndex * CHUNK_SIZE
        const size = Math.min(CHUNK_SIZE, transfer.fileSize - offset)
        const buffer = Buffer.alloc(size)

        fs.readSync(fd, buffer, 0, size, offset)

        const chunkMsg = encodeChunk(transfer.transferId, chunkIndex, buffer)
        try {
          this.tunnelManager.sendData(transfer.friendId, chunkMsg)
          transfer.unackedChunks.add(chunkIndex)
          transfer.chunkSendTimes.set(chunkIndex, Date.now())
          if (!transfer.chunkRetryCount.has(chunkIndex)) {
            transfer.chunkRetryCount.set(chunkIndex, 0)
          }
        } catch {
          // Connection lost — will retry on reconnect
          transfer.status = 'paused'
          break
        }

        chunkIndex++
      }

      // Check if all chunks sent and acknowledged
      if (transfer.completedChunks >= transfer.totalChunks) {
        if (transfer.retransmitTimer) clearInterval(transfer.retransmitTimer)
        fs.closeSync(fd)
        transfer.status = 'completed'
        this.tunnelManager.sendControl(transfer.friendId, {
          type: 'TRANSFER_COMPLETE',
          transferId: transfer.transferId
        })
        this.emitProgress(transfer)
        this.emit('transfer-complete', transfer.transferId, transfer.direction, transfer.friendId)
      }
    }

    // Store the send function for use when ACKs arrive
    ;(transfer as any)._sendNextChunks = sendNextChunks
    ;(transfer as any)._fd = fd

    // Retransmission timer — resend chunks that haven't been ACK'd within ACK_TIMEOUT
    transfer.retransmitTimer = setInterval(() => {
      if (transfer.status !== 'active') {
        clearInterval(transfer.retransmitTimer)
        return
      }

      const now = Date.now()
      for (const [idx, sentTime] of transfer.chunkSendTimes) {
        if (!transfer.unackedChunks.has(idx)) {
          transfer.chunkSendTimes.delete(idx)
          transfer.chunkRetryCount.delete(idx)
          continue
        }

        if (now - sentTime >= ACK_TIMEOUT) {
          const retries = transfer.chunkRetryCount.get(idx) ?? 0
          if (retries >= MAX_RETRIES_PER_CHUNK) {
            clearInterval(transfer.retransmitTimer)
            transfer.status = 'failed'
            this.emitProgress(transfer)
            this.emit('transfer-failed', transfer.transferId, 'Max retries exceeded')
            this.cleanup(transfer.transferId)
            return
          }

          try {
            const offset = idx * CHUNK_SIZE
            const size = Math.min(CHUNK_SIZE, transfer.fileSize - offset)
            const buf = Buffer.alloc(size)
            fs.readSync(fd, buf, 0, size, offset)
            const chunkMsg = encodeChunk(transfer.transferId, idx, buf)
            this.tunnelManager.sendData(transfer.friendId, chunkMsg)
            transfer.chunkSendTimes.set(idx, now)
            transfer.chunkRetryCount.set(idx, retries + 1)
          } catch {
            transfer.status = 'paused'
            clearInterval(transfer.retransmitTimer)
            break
          }
        }
      }
    }, RETRANSMIT_CHECK_INTERVAL)

    sendNextChunks()
  }

  /**
   * Handle incoming data chunk (receiver side).
   */
  private handleDataMessage(friendId: string, data: Buffer): void {
    try {
      const { transferId, chunkIndex, data: chunkData } = decodeChunk(data)
      const transfer = this.transfers.get(transferId)
      if (!transfer || transfer.direction !== 'receiving' || transfer.status !== 'active') return

      // Deduplicate: if we already received this chunk, just re-ACK (original ACK may have been lost)
      if (transfer.receivedChunks?.has(chunkIndex)) {
        const ack: ChunkAck = { type: 'CHUNK_ACK', transferId, chunkIndex }
        this.tunnelManager.sendControl(friendId, ack)
        return
      }
      transfer.receivedChunks?.add(chunkIndex)

      // Write chunk at correct offset (random-access fd-based write)
      const fd = (transfer as any)._receiveFd
      if (fd !== undefined) {
        const offset = chunkIndex * CHUNK_SIZE
        fs.writeSync(fd, chunkData, 0, chunkData.length, offset)
      }

      transfer.completedChunks++
      transfer.bytesTransferred += chunkData.length

      // Send ACK
      const ack: ChunkAck = {
        type: 'CHUNK_ACK',
        transferId,
        chunkIndex
      }
      this.tunnelManager.sendControl(friendId, ack)

      this.emitProgress(transfer)
    } catch {
      // Malformed chunk — ignore
    }
  }

  /**
   * Handle chunk acknowledgment (sender side).
   */
  private handleChunkAck(ack: ChunkAck): void {
    const transfer = this.transfers.get(ack.transferId)
    if (!transfer || transfer.direction !== 'sending') return

    // Guard duplicate ACKs (receiver may re-ACK retransmitted chunks)
    if (!transfer.unackedChunks.has(ack.chunkIndex)) return

    transfer.unackedChunks.delete(ack.chunkIndex)
    transfer.chunkSendTimes.delete(ack.chunkIndex)
    transfer.chunkRetryCount.delete(ack.chunkIndex)
    transfer.completedChunks++
    transfer.bytesTransferred += Math.min(
      CHUNK_SIZE,
      transfer.fileSize - ack.chunkIndex * CHUNK_SIZE
    )

    this.emitProgress(transfer)

    // Send more chunks if window has room
    const sendFn = (transfer as any)._sendNextChunks
    if (sendFn) sendFn()
  }

  /**
   * Handle transfer complete (receiver side) — verify checksum and finalize.
   */
  private handleTransferComplete(transferId: string): void {
    const transfer = this.transfers.get(transferId)
    if (!transfer || transfer.direction !== 'receiving') return

    transfer.status = 'completed'

    // Close the receive fd and truncate to exact file size
    const fd = (transfer as any)._receiveFd
    if (fd !== undefined) {
      fs.closeSync(fd)
      ;(transfer as any)._receiveFd = undefined
      if (transfer.tempPath) {
        fs.truncateSync(transfer.tempPath, transfer.fileSize)
      }
    }

    // Rename from .warpsend-partial to final name
    if (transfer.tempPath) {
      const customPath = (transfer as any)._customSavePath
      const finalPath = customPath || path.join(this.downloadFolder, transfer.fileName)
      const uniquePath = customPath ? finalPath : this.getUniquePath(finalPath)
      fs.renameSync(transfer.tempPath, uniquePath)
      transfer.filePath = uniquePath
    }
    this.emitProgress(transfer)
    this.emit('transfer-complete', transferId, 'receiving', transfer.friendId)
  }

  private handleTransferDeclined(transferId: string): void {
    const transfer = this.transfers.get(transferId)
    if (transfer) {
      transfer.status = 'cancelled'
      this.emitProgress(transfer)
      this.emit('transfer-declined', transferId)
      this.cleanup(transferId)
    }
  }

  private handleTransferCancelled(transferId: string): void {
    const transfer = this.transfers.get(transferId)
    if (transfer) {
      transfer.status = 'cancelled'
      this.emitProgress(transfer)
      this.emit('transfer-cancelled', transferId)
      this.cleanup(transferId)
    }
  }

  private handleTransferResume(message: TransferResume): void {
    const transfer = this.transfers.get(message.transferId)
    if (!transfer || transfer.direction !== 'sending') return

    transfer.completedChunks = message.lastChunkIndex + 1
    transfer.bytesTransferred = transfer.completedChunks * CHUNK_SIZE
    transfer.status = 'active'
    this.startSending(transfer)
  }

  /**
   * Emit throttled progress events.
   */
  private emitProgress(transfer: ActiveTransfer): void {
    const now = Date.now()
    const lastEmit = this.lastProgressEmit.get(transfer.transferId) ?? 0

    if (now - lastEmit < PROGRESS_THROTTLE && transfer.status === 'active') return
    this.lastProgressEmit.set(transfer.transferId, now)

    const elapsed = (now - transfer.startTime) / 1000
    const speed = elapsed > 0 ? transfer.bytesTransferred / elapsed : 0

    const progress: TransferProgress = {
      transferId: transfer.transferId,
      friendId: transfer.friendId,
      fileName: transfer.fileName,
      fileSize: transfer.fileSize,
      completedChunks: transfer.completedChunks,
      totalChunks: transfer.totalChunks,
      bytesTransferred: transfer.bytesTransferred,
      speed,
      direction: transfer.direction,
      status: transfer.status
    }

    this.emit('progress', progress)
  }

  /**
   * Compute SHA-256 checksum of a file.
   */
  private computeChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256')
      const stream = fs.createReadStream(filePath)
      stream.on('data', (data) => hash.update(data))
      stream.on('end', () => resolve(hash.digest('hex')))
      stream.on('error', reject)
    })
  }

  /**
   * Get a unique file path (append number if file exists).
   */
  private getUniquePath(filePath: string): string {
    if (!fs.existsSync(filePath)) return filePath

    const dir = path.dirname(filePath)
    const ext = path.extname(filePath)
    const base = path.basename(filePath, ext)
    let counter = 1

    while (fs.existsSync(path.join(dir, `${base} (${counter})${ext}`))) {
      counter++
    }

    return path.join(dir, `${base} (${counter})${ext}`)
  }

  /**
   * Clean up a completed/cancelled transfer.
   */
  private cleanup(transferId: string): void {
    const transfer = this.transfers.get(transferId)
    if (!transfer) return

    if (transfer.retransmitTimer) {
      clearInterval(transfer.retransmitTimer)
      transfer.retransmitTimer = undefined
    }
    if (transfer.readStream) transfer.readStream.destroy()
    if (transfer.writeStream) transfer.writeStream.end()
    if ((transfer as any)._fd) {
      try { fs.closeSync((transfer as any)._fd) } catch {}
    }
    if ((transfer as any)._receiveFd !== undefined) {
      try { fs.closeSync((transfer as any)._receiveFd) } catch {}
      ;(transfer as any)._receiveFd = undefined
    }

    // Delete partial file on cancel/fail
    if (transfer.tempPath && transfer.status !== 'completed') {
      try { fs.unlinkSync(transfer.tempPath) } catch {}
    }

    this.lastProgressEmit.delete(transferId)
  }

  /**
   * Get all active transfers.
   */
  getActiveTransfers(): TransferProgress[] {
    return Array.from(this.transfers.values())
      .filter((t) => t.status !== 'completed' && t.status !== 'cancelled' && t.status !== 'failed')
      .map((t) => {
        const elapsed = (Date.now() - t.startTime) / 1000
        return {
          transferId: t.transferId,
          friendId: t.friendId,
          fileName: t.fileName,
          fileSize: t.fileSize,
          completedChunks: t.completedChunks,
          totalChunks: t.totalChunks,
          bytesTransferred: t.bytesTransferred,
          speed: elapsed > 0 ? t.bytesTransferred / elapsed : 0,
          direction: t.direction,
          status: t.status
        }
      })
  }

  /**
   * Set the download folder.
   */
  setDownloadFolder(folder: string): void {
    this.downloadFolder = folder
  }
}
