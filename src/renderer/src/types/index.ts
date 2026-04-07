export interface Friend {
  id: string
  displayName: string
  nickname: string | null
  publicKey: string
  lastKnownEndpoint: string | null
  lastSeenAt: string | null
  isOnline: boolean
  transferCount: number
  createdAt: string
}

export interface TransferRequest {
  transferId: string
  friendId: string
  friendName: string
  fileName: string
  fileSize: number
  fileType: string
}

export interface TransferProgress {
  transferId: string
  friendId: string
  fileName: string
  fileSize: number
  completedChunks: number
  totalChunks: number
  bytesTransferred: number
  speed: number // bytes per second
  direction: 'sending' | 'receiving'
  status: string
}

export interface QueuedTransfer {
  id: string
  friendId: string
  filePath: string
  fileName: string
  fileSize: number
  status: 'queued' | 'transferring' | 'completed' | 'failed' | 'cancelled'
  chunksSent: number
  totalChunks: number
  createdAt: string
}

export interface DeviceInfo {
  name: string
  id: string
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
  filePath: string | null
}

export interface CompletedTransfer {
  transferId: string
  direction: 'sending' | 'receiving'
  filePath: string | null
  fileName: string
}

export interface TextMessageEntry {
  friendId: string
  messageId: string
  text: string
  timestamp: number
  direction: 'sent' | 'received'
}

export interface AppSettings {
  deviceName: string
  downloadFolder: string
  theme: 'midnight-teal' | 'onyx-black'
  startOnBoot: boolean
  notifications: boolean
}

declare global {
  interface Window {
    // Typed by contextBridge in preload — cross-project boundary, so typed loosely here
    api: any
  }
}
