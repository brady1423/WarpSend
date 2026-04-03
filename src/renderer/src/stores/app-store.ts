import { create } from 'zustand'
import type { Friend, TransferProgress, TransferRequest, DeviceInfo } from '../types'

interface AppState {
  // Device
  deviceInfo: DeviceInfo
  connectionString: string

  // Friends
  friends: Friend[]
  queueCounts: Record<string, number>

  // Transfers
  activeTransfers: TransferProgress[]
  incomingRequests: TransferRequest[]

  // Actions
  setDeviceInfo: (info: DeviceInfo) => void
  setConnectionString: (cs: string) => void
  setFriends: (friends: Friend[]) => void
  updateFriendStatus: (friendId: string, isOnline: boolean) => void
  setQueueCounts: (counts: Record<string, number>) => void
  updateTransferProgress: (progress: TransferProgress) => void
  removeTransfer: (transferId: string) => void
  addIncomingRequest: (request: TransferRequest) => void
  removeIncomingRequest: (transferId: string) => void
}

export const useAppStore = create<AppState>((set) => ({
  deviceInfo: { name: 'WarpSend User', id: '#0000' },
  connectionString: '',
  friends: [],
  queueCounts: {},
  activeTransfers: [],
  incomingRequests: [],

  setDeviceInfo: (info) => set({ deviceInfo: info }),
  setConnectionString: (cs) => set({ connectionString: cs }),

  setFriends: (friends) => set({ friends }),

  updateFriendStatus: (friendId, isOnline) =>
    set((state) => ({
      friends: state.friends.map((f) =>
        f.id === friendId ? { ...f, isOnline } : f
      )
    })),

  setQueueCounts: (counts) => set({ queueCounts: counts }),

  updateTransferProgress: (progress) =>
    set((state) => {
      const existing = state.activeTransfers.findIndex(
        (t) => t.transferId === progress.transferId
      )
      if (progress.status === 'completed' || progress.status === 'cancelled' || progress.status === 'failed') {
        return {
          activeTransfers: state.activeTransfers.filter(
            (t) => t.transferId !== progress.transferId
          )
        }
      }
      if (existing >= 0) {
        const updated = [...state.activeTransfers]
        updated[existing] = progress
        return { activeTransfers: updated }
      }
      return { activeTransfers: [...state.activeTransfers, progress] }
    }),

  removeTransfer: (transferId) =>
    set((state) => ({
      activeTransfers: state.activeTransfers.filter(
        (t) => t.transferId !== transferId
      )
    })),

  addIncomingRequest: (request) =>
    set((state) => ({
      incomingRequests: [...state.incomingRequests, request]
    })),

  removeIncomingRequest: (transferId) =>
    set((state) => ({
      incomingRequests: state.incomingRequests.filter(
        (r) => r.transferId !== transferId
      )
    }))
}))
