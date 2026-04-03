/**
 * TunnelManager — Manages encrypted tunnels to all paired friends.
 *
 * Handles:
 * - Starting/stopping tunnels per friend
 * - Reconnection logic
 * - Routing messages to the correct tunnel
 * - Online/offline status tracking
 */

import { EventEmitter } from 'events'
import { CryptoTunnel, TunnelConfig } from './crypto-tunnel'
import {
  ControlMessage,
  encodeControlMessage,
  encodeDataMessage,
  decodeFrame,
  parseControlMessage,
  FRAME_HEADER_SIZE
} from './protocol'

export interface PeerConnection {
  friendId: string
  tunnel: CryptoTunnel
  state: 'connecting' | 'connected' | 'disconnected'
  reconnectAttempts: number
  reconnectTimer?: ReturnType<typeof setTimeout>
}

export interface TunnelManagerEvents {
  'friend-online': (friendId: string) => void
  'friend-offline': (friendId: string) => void
  'control-message': (friendId: string, message: ControlMessage) => void
  'data-message': (friendId: string, data: Buffer) => void
  'error': (friendId: string, error: Error) => void
}

const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_BASE_DELAY = 2000 // 2 seconds, doubles each attempt

export class TunnelManager extends EventEmitter {
  private connections = new Map<string, PeerConnection>()
  private localPrivateKey: string
  private receiveBuffer = new Map<string, Buffer>()

  constructor(localPrivateKey: string) {
    super()
    this.localPrivateKey = localPrivateKey
  }

  /**
   * Connect to a friend — start an encrypted tunnel.
   */
  async connect(
    friendId: string,
    peerPublicKey: string,
    peerEndpoint: { host: string; port: number }
  ): Promise<void> {
    // Close existing connection if any
    this.disconnect(friendId)

    const config: TunnelConfig = {
      localPrivateKey: this.localPrivateKey,
      peerPublicKey,
      peerEndpoint
    }

    const tunnel = new CryptoTunnel(config)
    const connection: PeerConnection = {
      friendId,
      tunnel,
      state: 'connecting',
      reconnectAttempts: 0
    }

    this.connections.set(friendId, connection)
    this.receiveBuffer.set(friendId, Buffer.alloc(0))

    tunnel.on('connected', () => {
      connection.state = 'connected'
      connection.reconnectAttempts = 0
      this.emit('friend-online', friendId)
    })

    tunnel.on('disconnected', () => {
      connection.state = 'disconnected'
      this.emit('friend-offline', friendId)
      this.scheduleReconnect(friendId, peerPublicKey, peerEndpoint)
    })

    tunnel.on('data', (data: Buffer) => {
      this.handleIncomingData(friendId, data)
    })

    tunnel.on('error', (err: Error) => {
      this.emit('error', friendId, err)
    })

    try {
      await tunnel.start()
    } catch (err) {
      connection.state = 'disconnected'
      this.emit('error', friendId, err as Error)
      this.scheduleReconnect(friendId, peerPublicKey, peerEndpoint)
    }
  }

  /**
   * Handle incoming data from a tunnel.
   * Reassembles framed messages from the stream.
   */
  private handleIncomingData(friendId: string, data: Buffer): void {
    let buffer = Buffer.concat([
      this.receiveBuffer.get(friendId) || Buffer.alloc(0),
      data
    ])

    while (buffer.length >= FRAME_HEADER_SIZE) {
      const payloadLength = buffer.readUInt32BE(1)
      const totalLength = FRAME_HEADER_SIZE + payloadLength

      if (buffer.length < totalLength) break // incomplete frame

      const frame = buffer.subarray(0, totalLength)
      buffer = buffer.subarray(totalLength)

      try {
        const { type, payload } = decodeFrame(frame)

        if (type === 'control') {
          const message = parseControlMessage(payload)
          this.emit('control-message', friendId, message)
        } else {
          this.emit('data-message', friendId, payload)
        }
      } catch {
        // Malformed frame — skip
      }
    }

    this.receiveBuffer.set(friendId, buffer)
  }

  /**
   * Send a control message to a friend.
   */
  sendControl(friendId: string, message: ControlMessage): void {
    const connection = this.connections.get(friendId)
    if (!connection || connection.state !== 'connected') {
      throw new Error(`Not connected to friend ${friendId}`)
    }
    const frame = encodeControlMessage(message)
    connection.tunnel.send(frame)
  }

  /**
   * Send binary data to a friend.
   */
  sendData(friendId: string, data: Buffer): void {
    const connection = this.connections.get(friendId)
    if (!connection || connection.state !== 'connected') {
      throw new Error(`Not connected to friend ${friendId}`)
    }
    const frame = encodeDataMessage(data)
    connection.tunnel.send(frame)
  }

  /**
   * Disconnect from a specific friend.
   */
  disconnect(friendId: string): void {
    const connection = this.connections.get(friendId)
    if (!connection) return

    if (connection.reconnectTimer) {
      clearTimeout(connection.reconnectTimer)
    }
    connection.tunnel.stop()
    this.connections.delete(friendId)
    this.receiveBuffer.delete(friendId)
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   */
  private scheduleReconnect(
    friendId: string,
    peerPublicKey: string,
    peerEndpoint: { host: string; port: number }
  ): void {
    const connection = this.connections.get(friendId)
    if (!connection) return

    if (connection.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      return // give up
    }

    const delay = RECONNECT_BASE_DELAY * Math.pow(2, connection.reconnectAttempts)
    connection.reconnectAttempts++

    connection.reconnectTimer = setTimeout(() => {
      if (this.connections.has(friendId)) {
        this.connect(friendId, peerPublicKey, peerEndpoint)
      }
    }, delay)
  }

  /**
   * Get the connection state for a specific friend.
   */
  getConnectionState(friendId: string): 'connecting' | 'connected' | 'disconnected' | 'unknown' {
    const connection = this.connections.get(friendId)
    return connection?.state ?? 'unknown'
  }

  /**
   * Get all connected friend IDs.
   */
  getConnectedFriends(): string[] {
    return Array.from(this.connections.entries())
      .filter(([_, conn]) => conn.state === 'connected')
      .map(([id]) => id)
  }

  /**
   * Get the local port used for a specific friend's tunnel.
   */
  getLocalPort(friendId: string): number {
    const connection = this.connections.get(friendId)
    return connection?.tunnel.getLocalPort() ?? 0
  }

  /**
   * Disconnect from all friends and clean up.
   */
  shutdown(): void {
    for (const [friendId] of this.connections) {
      this.disconnect(friendId)
    }
  }
}
