/**
 * Friends IPC handlers — bridge between renderer and friends database/tunnel.
 */

import { ipcMain } from 'electron'
import {
  getAllFriends,
  addFriend,
  removeFriend,
  getFriendByPublicKey
} from '../services/friends-db'
import {
  encodeConnectionString,
  decodeConnectionString
} from '../services/connection-string'
import { getOrCreateDeviceKeys } from '../services/key-manager'
import { getPublicEndpoint } from '../services/nat-traversal'
import { TunnelManager } from '../services/tunnel-manager'

let tunnelManagerRef: TunnelManager | null = null

export function registerFriendsIpc(tunnelManager: TunnelManager): void {
  tunnelManagerRef = tunnelManager

  // List all friends
  ipcMain.handle('friends:list', () => {
    try {
      return { success: true, friends: getAllFriends() }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // Generate a connection string for pairing (now with real STUN-discovered IP)
  ipcMain.handle('friends:get-connection-string', async () => {
    try {
      const device = getOrCreateDeviceKeys()
      const endpoint = await getPublicEndpoint()

      const connectionString = encodeConnectionString({
        publicKey: device.publicKey,
        host: endpoint.host,
        port: endpoint.port || 51820,
        timestamp: Date.now()
      })

      return { success: true, connectionString }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // Pair with a friend using their connection string
  ipcMain.handle('friends:pair', async (_event, connectionString: string) => {
    try {
      const data = decodeConnectionString(connectionString)

      // Check if already friends
      const existing = getFriendByPublicKey(data.publicKey)
      if (existing) {
        return { success: false, error: 'Already paired with this device' }
      }

      // Add friend to database
      const friend = addFriend(
        'Friend',
        data.publicKey,
        `${data.host}:${data.port}`
      )

      // Establish tunnel
      if (tunnelManagerRef) {
        tunnelManagerRef.connect(
          friend.id,
          data.publicKey,
          { host: data.host, port: data.port }
        ).catch(() => {
          // Connection attempt failed — friend is saved but offline
        })
      }

      return { success: true, friend }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })

  // Remove a friend
  ipcMain.handle('friends:remove', (_event, id: string) => {
    try {
      if (tunnelManagerRef) {
        tunnelManagerRef.disconnect(id)
      }
      removeFriend(id)
      return { success: true }
    } catch (err) {
      return { success: false, error: (err as Error).message }
    }
  })
}
