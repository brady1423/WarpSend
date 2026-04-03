import { useEffect } from 'react'
import { useAppStore } from '../stores/app-store'

/**
 * Initialize the app — fetch device info, friends, and set up IPC listeners.
 * Call this once in App.tsx.
 */
export function useAppInit() {
  const {
    setDeviceInfo,
    setFriends,
    updateFriendStatus,
    updateTransferProgress,
    addIncomingRequest,
    setQueueCounts
  } = useAppStore()

  useEffect(() => {
    const api = window.api
    if (!api) return

    // Fetch initial data
    api.app.getDeviceInfo().then(setDeviceInfo).catch(() => {})

    api.friends.list().then((result: any) => {
      if (result?.success) setFriends(result.friends)
    }).catch(() => {})

    // Subscribe to tunnel status events
    const unsubStatus = api.tunnel.onFriendStatus((data: any) => {
      updateFriendStatus(data.friendId, data.status === 'online')
    })

    // Subscribe to transfer progress
    const unsubProgress = api.transfers.onProgress((data: any) => {
      updateTransferProgress(data)
    })

    // Subscribe to incoming transfer requests
    const unsubIncoming = api.transfers.onIncoming((data: any) => {
      addIncomingRequest(data)
    })

    return () => {
      unsubStatus()
      unsubProgress()
      unsubIncoming()
    }
  }, [])
}
