import { useEffect } from 'react'
import { useAppStore } from '../stores/app-store'
import { showToast } from '../components/shared/Toast'

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
    removeIncomingRequest,
    removeTransfer,
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

    // Load theme from settings
    api.settings.get('theme').then((result: any) => {
      if (result?.success && result.value) {
        document.documentElement.setAttribute('data-theme', result.value)
      }
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

    // Subscribe to transfer failures — clean up UI + show toast
    const unsubFailed = (api.transfers as any).onFailed?.((data: any) => {
      removeTransfer(data.transferId)
      removeIncomingRequest(data.transferId)
      showToast('Transfer failed — file could not be sent', 'error')
    })

    // Subscribe to transfer completions — clean up incoming requests
    const unsubCompleted = (api.transfers as any).onCompleted?.((data: any) => {
      removeTransfer(data.transferId)
      removeIncomingRequest(data.transferId)
    })

    // Stale request cleanup — remove pending incoming requests older than 60s
    const staleTimer = setInterval(() => {
      const state = useAppStore.getState()
      const now = Date.now()
      state.incomingRequests.forEach((req: any) => {
        if (req._addedAt && now - req._addedAt > 60000) {
          removeIncomingRequest(req.transferId)
        }
      })
    }, 15000)

    return () => {
      unsubStatus()
      unsubProgress()
      unsubIncoming()
      unsubFailed?.()
      unsubCompleted?.()
      clearInterval(staleTimer)
    }
  }, [])
}
