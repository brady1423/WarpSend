/**
 * TunnelManager — Manages encrypted tunnels to all paired friends.
 *
 * Uses a SINGLE shared UDP socket on port 51820 for all connections.
 * Routes incoming packets to the correct tunnel based on sender address.
 */

import dgram from 'dgram'
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
  peerPublicKey: string
  peerEndpoint: { host: string; port: number }
  state: 'connecting' | 'connected' | 'disconnected'
  reconnectAttempts: number
  reconnectTimer?: ReturnType<typeof setTimeout>
}

const MAX_RECONNECT_ATTEMPTS = 10
const RECONNECT_BASE_DELAY = 2000
const LISTEN_PORT = 51820

export class TunnelManager extends EventEmitter {
  private connections = new Map<string, PeerConnection>()
  private localPrivateKey: string
  private receiveBuffer = new Map<string, Buffer>()
  private sharedSocket: dgram.Socket | null = null
  private socketReady = false

  constructor(localPrivateKey: string) {
    super()
    this.localPrivateKey = localPrivateKey
    this.initSharedSocket()
  }

  /**
   * Create and bind the shared UDP socket.
   * All tunnels send/receive through this single socket.
   */
  private initSharedSocket(): void {
    this.sharedSocket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

    this.sharedSocket.on('message', (msg, rinfo) => {
      this.routeIncomingPacket(msg, rinfo)
    })

    this.sharedSocket.on('error', (err) => {
      // Port might be in use — try a random port
      if (!this.socketReady) {
        this.sharedSocket?.bind(0, () => {
          this.socketReady = true
        })
      }
    })

    this.sharedSocket.bind(LISTEN_PORT, () => {
      this.socketReady = true
    })
  }

  /**
   * Route an incoming UDP packet to the correct tunnel.
   * Matches by sender address:port, or tries all tunnels if unknown.
   */
  private routeIncomingPacket(msg: Buffer, rinfo: dgram.RemoteInfo): void {
    const senderKey = `${rinfo.address}:${rinfo.port}`

    // First try exact match by known peer endpoint
    for (const [, conn] of this.connections) {
      const peerKey = `${conn.peerEndpoint.host}:${conn.peerEndpoint.port}`
      if (peerKey === senderKey) {
        conn.tunnel.injectPacket(msg, rinfo)
        return
      }
    }

    // No exact match — try all tunnels (peer may have a new IP/port)
    // The tunnel will reject packets it can't decrypt
    for (const [, conn] of this.connections) {
      conn.tunnel.injectPacket(msg, rinfo)
    }
  }

  /**
   * Connect to a friend — start an encrypted tunnel using the shared socket.
   */
  async connect(
    friendId: string,
    peerPublicKey: string,
    peerEndpoint: { host: string; port: number },
    _localPort?: number
  ): Promise<void> {
    // Close existing connection if any
    this.disconnect(friendId)

    // Wait for shared socket to be ready
    if (!this.socketReady) {
      await new Promise<void>((resolve) => {
        const check = setInterval(() => {
          if (this.socketReady) {
            clearInterval(check)
            resolve()
          }
        }, 100)
      })
    }

    const config: TunnelConfig = {
      localPrivateKey: this.localPrivateKey,
      peerPublicKey,
      peerEndpoint,
      sharedSocket: this.sharedSocket!
    }

    const tunnel = new CryptoTunnel(config)
    const connection: PeerConnection = {
      friendId,
      tunnel,
      peerPublicKey,
      peerEndpoint,
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

      if (buffer.length < totalLength) break

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

  sendControl(friendId: string, message: ControlMessage): void {
    const connection = this.connections.get(friendId)
    if (!connection || connection.state !== 'connected') {
      throw new Error(`Not connected to friend ${friendId}`)
    }
    const frame = encodeControlMessage(message)
    connection.tunnel.send(frame)
  }

  sendData(friendId: string, data: Buffer): void {
    const connection = this.connections.get(friendId)
    if (!connection || connection.state !== 'connected') {
      throw new Error(`Not connected to friend ${friendId}`)
    }
    const frame = encodeDataMessage(data)
    connection.tunnel.send(frame)
  }

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

  private scheduleReconnect(
    friendId: string,
    peerPublicKey: string,
    peerEndpoint: { host: string; port: number }
  ): void {
    const connection = this.connections.get(friendId)
    if (!connection) return

    if (connection.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) return

    const delay = RECONNECT_BASE_DELAY * Math.pow(2, connection.reconnectAttempts)
    connection.reconnectAttempts++

    connection.reconnectTimer = setTimeout(() => {
      if (this.connections.has(friendId)) {
        this.connect(friendId, peerPublicKey, peerEndpoint)
      }
    }, delay)
  }

  getConnectionState(friendId: string): 'connecting' | 'connected' | 'disconnected' | 'unknown' {
    return this.connections.get(friendId)?.state ?? 'unknown'
  }

  getConnectedFriends(): string[] {
    return Array.from(this.connections.entries())
      .filter(([_, conn]) => conn.state === 'connected')
      .map(([id]) => id)
  }

  getListenPort(): number {
    return this.sharedSocket?.address()?.port ?? 0
  }

  shutdown(): void {
    for (const [friendId] of this.connections) {
      this.disconnect(friendId)
    }
    if (this.sharedSocket) {
      this.sharedSocket.close()
      this.sharedSocket = null
    }
  }
}
