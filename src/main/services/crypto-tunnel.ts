/**
 * CryptoTunnel — Encrypted peer-to-peer tunnel using Node.js crypto.
 *
 * Uses the same algorithms as WireGuard:
 *   - X25519 for key exchange (Diffie-Hellman)
 *   - ChaCha20-Poly1305 for authenticated encryption
 *
 * Each tunnel instance represents an encrypted connection to a single peer.
 * Data flows over UDP sockets.
 */

import crypto from 'crypto'
import dgram from 'dgram'
import { EventEmitter } from 'events'

const NONCE_SIZE = 12
const TAG_SIZE = 16
const HANDSHAKE_MAGIC = Buffer.from('WARP')
const KEEPALIVE_INTERVAL = 25_000 // 25 seconds, same as WireGuard

export interface TunnelConfig {
  localPrivateKey: string   // base64 raw 32-byte X25519 private key
  peerPublicKey: string     // base64 raw 32-byte X25519 public key
  peerEndpoint: { host: string; port: number }
  localPort?: number
}

export interface TunnelEvents {
  'data': (data: Buffer) => void
  'connected': () => void
  'disconnected': () => void
  'error': (err: Error) => void
}

type TunnelState = 'idle' | 'handshaking' | 'connected' | 'disconnected'

export class CryptoTunnel extends EventEmitter {
  private config: TunnelConfig
  private socket: dgram.Socket | null = null
  private sharedSecret: Buffer | null = null
  private sendNonce = 0n
  private recvNonce = 0n
  private state: TunnelState = 'idle'
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null
  private handshakeTimer: ReturnType<typeof setTimeout> | null = null
  private lastRecvTime = 0

  constructor(config: TunnelConfig) {
    super()
    this.config = config
  }

  /**
   * Derive the shared secret from our private key + peer's public key.
   * Uses X25519 ECDH.
   */
  private deriveSharedSecret(): Buffer {
    // Reconstruct proper key objects from raw 32-byte keys
    const privKeyDer = this.buildPkcs8Der(
      Buffer.from(this.config.localPrivateKey, 'base64')
    )
    const pubKeyDer = this.buildSpkiDer(
      Buffer.from(this.config.peerPublicKey, 'base64')
    )

    const privateKey = crypto.createPrivateKey({
      key: privKeyDer,
      format: 'der',
      type: 'pkcs8'
    })

    const publicKey = crypto.createPublicKey({
      key: pubKeyDer,
      format: 'der',
      type: 'spki'
    })

    return crypto.diffieHellman({ privateKey, publicKey })
  }

  /**
   * Wrap a raw 32-byte X25519 private key in PKCS8 DER format.
   */
  private buildPkcs8Der(rawKey: Buffer): Buffer {
    // PKCS8 header for X25519 private key
    const header = Buffer.from([
      0x30, 0x2e, // SEQUENCE (46 bytes)
      0x02, 0x01, 0x00, // INTEGER 0 (version)
      0x30, 0x05, // SEQUENCE (5 bytes)
      0x06, 0x03, 0x2b, 0x65, 0x6e, // OID 1.3.101.110 (X25519)
      0x04, 0x22, // OCTET STRING (34 bytes)
      0x04, 0x20  // OCTET STRING (32 bytes) — the actual key
    ])
    return Buffer.concat([header, rawKey])
  }

  /**
   * Wrap a raw 32-byte X25519 public key in SPKI DER format.
   */
  private buildSpkiDer(rawKey: Buffer): Buffer {
    // SPKI header for X25519 public key
    const header = Buffer.from([
      0x30, 0x2a, // SEQUENCE (42 bytes)
      0x30, 0x05, // SEQUENCE (5 bytes)
      0x06, 0x03, 0x2b, 0x65, 0x6e, // OID 1.3.101.110 (X25519)
      0x03, 0x21, 0x00 // BIT STRING (33 bytes, 0 unused bits)
    ])
    return Buffer.concat([header, rawKey])
  }

  /**
   * Encrypt data using ChaCha20-Poly1305 with the shared secret.
   */
  private encrypt(plaintext: Buffer): Buffer {
    const nonce = Buffer.alloc(NONCE_SIZE)
    nonce.writeBigUInt64LE(this.sendNonce, 0)
    this.sendNonce++

    const cipher = crypto.createCipheriv(
      'chacha20-poly1305',
      this.sharedSecret!,
      nonce,
      { authTagLength: TAG_SIZE }
    )

    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()])
    const tag = cipher.getAuthTag()

    // Format: [nonce (12)] [tag (16)] [ciphertext (N)]
    return Buffer.concat([nonce, tag, encrypted])
  }

  /**
   * Decrypt data using ChaCha20-Poly1305 with the shared secret.
   */
  private decrypt(packet: Buffer): Buffer {
    const nonce = packet.subarray(0, NONCE_SIZE)
    const tag = packet.subarray(NONCE_SIZE, NONCE_SIZE + TAG_SIZE)
    const ciphertext = packet.subarray(NONCE_SIZE + TAG_SIZE)

    const decipher = crypto.createDecipheriv(
      'chacha20-poly1305',
      this.sharedSecret!,
      nonce,
      { authTagLength: TAG_SIZE }
    )
    decipher.setAuthTag(tag)

    const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()])
    this.recvNonce++
    return decrypted
  }

  /**
   * Start the tunnel — bind UDP socket, derive shared secret, begin handshake.
   */
  async start(): Promise<void> {
    this.sharedSecret = this.deriveSharedSecret()
    this.state = 'handshaking'

    this.socket = dgram.createSocket('udp4')

    this.socket.on('message', (msg, rinfo) => {
      this.handlePacket(msg, rinfo)
    })

    this.socket.on('error', (err) => {
      this.emit('error', err)
    })

    return new Promise((resolve, reject) => {
      this.socket!.bind(this.config.localPort || 0, () => {
        this.sendHandshake()
        this.startHandshakeRetry()
        resolve()
      })

      this.socket!.on('error', reject)
    })
  }

  /**
   * Send a handshake packet to initiate the connection.
   */
  private sendHandshake(): void {
    // Handshake: [WARP magic (4)] [our public key (32)] [encrypted timestamp (N)]
    const pubKey = Buffer.from(this.config.peerPublicKey, 'base64') // sending OUR key to identify ourselves
    const localPubKey = this.getLocalPublicKey()
    const timestamp = Buffer.alloc(8)
    timestamp.writeBigInt64BE(BigInt(Date.now()), 0)
    const encryptedTimestamp = this.encrypt(timestamp)

    const handshake = Buffer.concat([HANDSHAKE_MAGIC, localPubKey, encryptedTimestamp])
    this.sendRaw(handshake)
  }

  /**
   * Get the local public key derived from the private key.
   */
  private getLocalPublicKey(): Buffer {
    const privKeyDer = this.buildPkcs8Der(
      Buffer.from(this.config.localPrivateKey, 'base64')
    )
    const privateKey = crypto.createPrivateKey({
      key: privKeyDer,
      format: 'der',
      type: 'pkcs8'
    })
    const publicKey = crypto.createPublicKey(privateKey)
    const spki = publicKey.export({ type: 'spki', format: 'der' })
    return Buffer.from(spki).subarray(spki.length - 32)
  }

  /**
   * Retry handshake every 2 seconds until connected.
   */
  private startHandshakeRetry(): void {
    let attempts = 0
    this.handshakeTimer = setInterval(() => {
      if (this.state === 'connected') {
        if (this.handshakeTimer) clearInterval(this.handshakeTimer)
        return
      }
      attempts++
      if (attempts > 15) {
        // 30 seconds of trying
        if (this.handshakeTimer) clearInterval(this.handshakeTimer)
        this.state = 'disconnected'
        this.emit('disconnected')
        return
      }
      this.sendHandshake()
    }, 2000)
  }

  /**
   * Handle an incoming UDP packet.
   */
  private handlePacket(msg: Buffer, _rinfo: dgram.RemoteInfo): void {
    this.lastRecvTime = Date.now()

    // Check if this is a handshake packet
    if (msg.length >= 4 && msg.subarray(0, 4).equals(HANDSHAKE_MAGIC)) {
      this.handleHandshake(msg)
      return
    }

    // Regular encrypted data packet
    if (this.state !== 'connected') return

    try {
      const decrypted = this.decrypt(msg)
      // Ignore keepalive packets (empty)
      if (decrypted.length > 0) {
        this.emit('data', decrypted)
      }
    } catch {
      // Decryption failed — ignore (could be replayed/malformed)
    }
  }

  /**
   * Handle a handshake packet from the peer.
   */
  private handleHandshake(msg: Buffer): void {
    try {
      const peerPubKey = msg.subarray(4, 36)
      const encryptedTimestamp = msg.subarray(36)

      // Verify the timestamp decrypts successfully (proves they have the right shared secret)
      const timestamp = this.decrypt(encryptedTimestamp)
      const ts = timestamp.readBigInt64BE(0)
      const age = Date.now() - Number(ts)

      // Accept handshakes from the last 30 seconds
      if (Math.abs(age) > 30_000) return

      if (this.state !== 'connected') {
        this.state = 'connected'
        if (this.handshakeTimer) clearInterval(this.handshakeTimer)

        // Send our own handshake back if we haven't yet
        this.sendHandshake()

        // Start keepalive
        this.startKeepalive()

        this.emit('connected')
      }
    } catch {
      // Invalid handshake — ignore
    }
  }

  /**
   * Send encrypted data to the peer.
   */
  send(data: Buffer): void {
    if (this.state !== 'connected' || !this.sharedSecret) {
      throw new Error('Tunnel not connected')
    }
    const encrypted = this.encrypt(data)
    this.sendRaw(encrypted)
  }

  /**
   * Send a raw UDP packet to the peer endpoint.
   */
  private sendRaw(data: Buffer): void {
    if (!this.socket) return
    const { host, port } = this.config.peerEndpoint
    this.socket.send(data, port, host)
  }

  /**
   * Start periodic keepalive packets.
   */
  private startKeepalive(): void {
    this.keepaliveTimer = setInterval(() => {
      if (this.state !== 'connected') {
        if (this.keepaliveTimer) clearInterval(this.keepaliveTimer)
        return
      }

      // Check if peer is still alive (no data in 60 seconds = dead)
      if (Date.now() - this.lastRecvTime > 60_000) {
        this.state = 'disconnected'
        if (this.keepaliveTimer) clearInterval(this.keepaliveTimer)
        this.emit('disconnected')
        return
      }

      // Send empty encrypted packet as keepalive
      try {
        const encrypted = this.encrypt(Buffer.alloc(0))
        this.sendRaw(encrypted)
      } catch {
        // ignore
      }
    }, KEEPALIVE_INTERVAL)
  }

  /**
   * Get the local port this tunnel is bound to.
   */
  getLocalPort(): number {
    return this.socket?.address()?.port ?? 0
  }

  /**
   * Get current tunnel state.
   */
  getState(): TunnelState {
    return this.state
  }

  /**
   * Stop the tunnel and clean up.
   */
  stop(): void {
    this.state = 'disconnected'
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer)
    if (this.handshakeTimer) clearInterval(this.handshakeTimer)
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
    this.sharedSecret = null
    this.sendNonce = 0n
    this.recvNonce = 0n
  }
}
