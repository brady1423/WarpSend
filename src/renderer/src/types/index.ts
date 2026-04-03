export interface Friend {
  id: string
  displayName: string
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
  chunksSent: number
  totalChunks: number
  speed: number // bytes per second
  direction: 'sending' | 'receiving'
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

export interface AppSettings {
  deviceName: string
  downloadFolder: string
  theme: 'dark' | 'light'
  startOnBoot: boolean
  notifications: boolean
}

declare global {
  interface Window {
    api: import('../../preload/index').WarpSendAPI
  }
}
