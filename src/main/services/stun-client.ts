/**
 * Minimal STUN client — discovers our public IP and mapped UDP port.
 *
 * Implements just the STUN Binding Request (RFC 5389).
 * Queries multiple public STUN servers for reliability.
 */

import dgram from 'dgram'
import crypto from 'crypto'

export interface StunResult {
  publicIp: string
  publicPort: number
}

// Public STUN servers (free, no auth required)
const STUN_SERVERS = [
  { host: 'stun.l.google.com', port: 19302 },
  { host: 'stun1.l.google.com', port: 19302 },
  { host: 'stun.cloudflare.com', port: 3478 }
]

// STUN message constants
const STUN_BINDING_REQUEST = 0x0001
const STUN_BINDING_RESPONSE = 0x0101
const STUN_MAGIC_COOKIE = 0x2112A442
const STUN_ATTR_XOR_MAPPED_ADDRESS = 0x0020
const STUN_ATTR_MAPPED_ADDRESS = 0x0001

// Cache
let cachedResult: StunResult | null = null
let cacheTimestamp = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

/**
 * Build a STUN Binding Request packet.
 */
function buildBindingRequest(): Buffer {
  const msg = Buffer.alloc(20)

  // Message type: Binding Request
  msg.writeUInt16BE(STUN_BINDING_REQUEST, 0)

  // Message length: 0 (no attributes)
  msg.writeUInt16BE(0, 2)

  // Magic cookie
  msg.writeUInt32BE(STUN_MAGIC_COOKIE, 4)

  // Transaction ID: 12 random bytes
  crypto.randomBytes(12).copy(msg, 8)

  return msg
}

/**
 * Parse the XOR-MAPPED-ADDRESS or MAPPED-ADDRESS from a STUN response.
 */
function parseBindingResponse(msg: Buffer, transactionId: Buffer): StunResult | null {
  // Verify it's a Binding Response
  const msgType = msg.readUInt16BE(0)
  if (msgType !== STUN_BINDING_RESPONSE) return null

  const msgLength = msg.readUInt16BE(2)
  let offset = 20 // skip header

  while (offset < 20 + msgLength) {
    const attrType = msg.readUInt16BE(offset)
    const attrLength = msg.readUInt16BE(offset + 2)
    const attrValue = msg.subarray(offset + 4, offset + 4 + attrLength)

    if (attrType === STUN_ATTR_XOR_MAPPED_ADDRESS) {
      // XOR-MAPPED-ADDRESS
      const family = attrValue.readUInt8(1)
      if (family === 0x01) {
        // IPv4
        const xorPort = attrValue.readUInt16BE(2) ^ (STUN_MAGIC_COOKIE >> 16)
        const xorIp = attrValue.readUInt32BE(4) ^ STUN_MAGIC_COOKIE
        const ip = [
          (xorIp >> 24) & 0xff,
          (xorIp >> 16) & 0xff,
          (xorIp >> 8) & 0xff,
          xorIp & 0xff
        ].join('.')
        return { publicIp: ip, publicPort: xorPort }
      }
    } else if (attrType === STUN_ATTR_MAPPED_ADDRESS) {
      // MAPPED-ADDRESS (fallback, non-XOR)
      const family = attrValue.readUInt8(1)
      if (family === 0x01) {
        const port = attrValue.readUInt16BE(2)
        const ip = [
          attrValue.readUInt8(4),
          attrValue.readUInt8(5),
          attrValue.readUInt8(6),
          attrValue.readUInt8(7)
        ].join('.')
        return { publicIp: ip, publicPort: port }
      }
    }

    // Pad to 4-byte boundary
    offset += 4 + Math.ceil(attrLength / 4) * 4
  }

  return null
}

/**
 * Query a single STUN server.
 */
function queryStunServer(
  server: { host: string; port: number },
  timeoutMs: number = 3000
): Promise<StunResult> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    const request = buildBindingRequest()
    const transactionId = request.subarray(8, 20)

    const timer = setTimeout(() => {
      socket.close()
      reject(new Error(`STUN timeout: ${server.host}:${server.port}`))
    }, timeoutMs)

    socket.on('message', (msg) => {
      clearTimeout(timer)
      const result = parseBindingResponse(msg, transactionId)
      socket.close()
      if (result) {
        resolve(result)
      } else {
        reject(new Error('Failed to parse STUN response'))
      }
    })

    socket.on('error', (err) => {
      clearTimeout(timer)
      socket.close()
      reject(err)
    })

    socket.send(request, server.port, server.host)
  })
}

/**
 * Discover our public IP and port by querying STUN servers.
 * Tries servers in order, returns first successful result.
 * Results are cached for 5 minutes.
 */
export async function discoverPublicEndpoint(): Promise<StunResult> {
  // Return cached result if fresh
  if (cachedResult && Date.now() - cacheTimestamp < CACHE_TTL) {
    return cachedResult
  }

  const errors: Error[] = []

  for (const server of STUN_SERVERS) {
    try {
      const result = await queryStunServer(server)
      cachedResult = result
      cacheTimestamp = Date.now()
      return result
    } catch (err) {
      errors.push(err as Error)
    }
  }

  throw new Error(
    `All STUN servers failed: ${errors.map((e) => e.message).join(', ')}`
  )
}

/**
 * Clear the STUN cache, forcing a fresh query next time.
 */
export function clearStunCache(): void {
  cachedResult = null
  cacheTimestamp = 0
}

/**
 * Check if we're behind a symmetric NAT by comparing results from two STUN servers.
 * If the mapped ports differ, it's symmetric (hole punching won't work).
 */
export async function detectSymmetricNat(): Promise<boolean> {
  try {
    const [result1, result2] = await Promise.all([
      queryStunServer(STUN_SERVERS[0]),
      queryStunServer(STUN_SERVERS[1])
    ])
    // Different mapped ports = symmetric NAT
    return result1.publicPort !== result2.publicPort
  } catch {
    return false // can't determine, assume not symmetric
  }
}
