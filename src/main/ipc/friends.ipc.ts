/**
 * Friends IPC handlers — bridge between renderer and friends database/tunnel.
 */

import { ipcMain } from 'electron'
import {
  getAllFriends,
  addFriend,
  removeFriend,
  getFriendByPublicKey,
  updateFriendOnlineStatus
} from '../services/friends-db'
import {
  encodeConnectionString,
  decodeConnectionString
} from '../services/connection-string'
import { getOrCreateDeviceKeys } from '../services/key-manager'
import { getPublicEndpoint } from '../services/nat-traversal'
import { TunnelManager } from '../services/tunnel-manager'

const LISTEN_PORT = 51820 // Fixed port for incoming connections

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

  // Generate a connection string with real public IP and our listening port
  ipcMain.handle('friends:get-connection-string', async () => {
    try {
      const device = getOrCreateDeviceKeys()
      const endpoint = await getPublicEndpoint()

      const connectionString = encodeConnectionString({
        publicKey: device.publicKey,
        host: endpoint.host,
        port: LISTEN_PORT,
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

      // Establish tunnel to the friend's endpoint, using our fixed listen port
      if (tunnelManagerRef) {
        tunnelManagerRef.connect(
          friend.id,
          data.publicKey,
          { host: data.host, port: data.port },
          LISTEN_PORT
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

/**
 * On startup, try to reconnect to all saved friends.
 */
export function reconnectAllFriends(tunnelManager: TunnelManager): void {
  const friends = getAllFriends()
  for (const friend of friends) {
    if (friend.lastKnownEndpoint) {
      const [host, portStr] = friend.lastKnownEndpoint.split(':')
      const port = parseInt(portStr, 10)
      if (host && port) {
        tunnelManager.connect(
          friend.id,
          friend.publicKey,
          { host, port },
          LISTEN_PORT
        ).catch(() => {
          // Can't reach friend — they'll show as offline
        })
      }
    }
  }
}
