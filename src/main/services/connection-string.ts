/**
 * Connection String — Encode/decode pairing data into shareable strings.
 *
 * Format: WARP-<base64url(publicKey[32] + ipv4[4] + port[2] + timestamp[4])>
 *
 * Total payload: 42 bytes → ~56 chars base64url + 5 char prefix = ~61 chars
 * Example: WARP-aBcDeFgHiJkLmNoPqRsTuVwXyZ012345678ABCDEF012345-abc
 *
 * The timestamp enables 10-minute expiry without a server.
 */

const PREFIX = 'WARP-'
const EXPIRY_MS = 10 * 60 * 1000 // 10 minutes

export interface ConnectionData {
  publicKey: string    // base64 32-byte X25519 public key
  host: string         // IPv4 address
  port: number         // UDP port
  timestamp: number    // Unix timestamp (seconds)
}

/**
 * Encode connection data into a shareable string.
 */
export function encodeConnectionString(data: ConnectionData): string {
  const payload = Buffer.alloc(42)

  // Public key (32 bytes)
  const pubKeyBuf = Buffer.from(data.publicKey, 'base64')
  if (pubKeyBuf.length !== 32) {
    throw new Error('Public key must be 32 bytes')
  }
  pubKeyBuf.copy(payload, 0)

  // IPv4 address (4 bytes)
  const parts = data.host.split('.')
  if (parts.length !== 4) {
    throw new Error('Invalid IPv4 address')
  }
  for (let i = 0; i < 4; i++) {
    payload.writeUInt8(parseInt(parts[i], 10), 32 + i)
  }

  // Port (2 bytes, big-endian)
  payload.writeUInt16BE(data.port, 36)

  // Timestamp (4 bytes, seconds since epoch, big-endian)
  const timestampSec = Math.floor(data.timestamp / 1000)
  payload.writeUInt32BE(timestampSec, 38)

  // Encode as base64url (URL-safe, no padding)
  const encoded = payload.toString('base64url')
  return PREFIX + encoded
}

/**
 * Decode a connection string back to its components.
 * Throws if the string is invalid or expired.
 */
export function decodeConnectionString(connectionString: string): ConnectionData {
  if (!connectionString.startsWith(PREFIX)) {
    throw new Error('Invalid connection string: missing WARP- prefix')
  }

  const encoded = connectionString.substring(PREFIX.length)
  const payload = Buffer.from(encoded, 'base64url')

  if (payload.length !== 42) {
    throw new Error(`Invalid connection string: expected 42 bytes, got ${payload.length}`)
  }

  // Public key (32 bytes)
  const publicKey = payload.subarray(0, 32).toString('base64')

  // IPv4 address (4 bytes)
  const host = [
    payload.readUInt8(32),
    payload.readUInt8(33),
    payload.readUInt8(34),
    payload.readUInt8(35)
  ].join('.')

  // Port (2 bytes)
  const port = payload.readUInt16BE(36)

  // Timestamp (4 bytes, seconds)
  const timestampSec = payload.readUInt32BE(38)
  const timestamp = timestampSec * 1000

  // Check expiry
  const age = Date.now() - timestamp
  if (age > EXPIRY_MS) {
    throw new Error('Connection string has expired (older than 10 minutes)')
  }
  if (age < -60_000) {
    // More than 1 minute in the future — clock skew protection
    throw new Error('Connection string timestamp is in the future')
  }

  return { publicKey, host, port, timestamp }
}

/**
 * Validate a connection string without throwing.
 * Returns the decoded data or null if invalid.
 */
export function validateConnectionString(connectionString: string): ConnectionData | null {
  try {
    return decodeConnectionString(connectionString)
  } catch {
    return null
  }
}
