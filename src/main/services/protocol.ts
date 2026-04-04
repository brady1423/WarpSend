/**
 * WarpSend Application Protocol
 *
 * All messages flow over the WireGuard tunnel.
 * Control messages are JSON. Data messages are binary with a header.
 */

// ── Control Message Types ──────────────────────────────────────────

export interface PairRequest {
  type: 'PAIR_REQUEST'
  publicKey: string
  endpoint: string
  displayName: string
}

export interface PairResponse {
  type: 'PAIR_RESPONSE'
  publicKey: string
  displayName: string
}

export interface TransferRequest {
  type: 'TRANSFER_REQUEST'
  transferId: string
  fileName: string
  fileSize: number
  fileType: string
  checksum: string  // SHA-256 hex
  resume?: boolean
}

export interface TransferAccept {
  type: 'TRANSFER_ACCEPT'
  transferId: string
}

export interface TransferDecline {
  type: 'TRANSFER_DECLINE'
  transferId: string
}

export interface TransferCancel {
  type: 'TRANSFER_CANCEL'
  transferId: string
}

export interface TransferComplete {
  type: 'TRANSFER_COMPLETE'
  transferId: string
}

export interface TransferResume {
  type: 'TRANSFER_RESUME'
  transferId: string
  lastChunkIndex: number
}

export interface ChunkAck {
  type: 'CHUNK_ACK'
  transferId: string
  chunkIndex: number
}

export interface Ping {
  type: 'PING'
  timestamp: number
}

export interface Pong {
  type: 'PONG'
  timestamp: number
}

export interface StatusUpdate {
  type: 'STATUS'
  online: boolean
}

export interface TextMessage {
  type: 'TEXT_MESSAGE'
  messageId: string
  text: string
  timestamp: number
}

export type ControlMessage =
  | PairRequest
  | PairResponse
  | TransferRequest
  | TransferAccept
  | TransferDecline
  | TransferCancel
  | TransferComplete
  | TransferResume
  | ChunkAck
  | Ping
  | Pong
  | StatusUpdate
  | TextMessage

// ── Binary Data Message ────────────────────────────────────────────

/**
 * Binary chunk message format:
 *
 *   [2 bytes]  message type (0x0001 = CHUNK)
 *   [16 bytes] transferId (UUID as raw bytes)
 *   [4 bytes]  chunkIndex (uint32 big-endian)
 *   [4 bytes]  chunkSize  (uint32 big-endian)
 *   [N bytes]  chunk data (up to CHUNK_SIZE)
 */

export const CHUNK_SIZE = 16 * 1024 // 16KB — sized to reduce UDP fragmentation
export const MSG_TYPE_CHUNK = 0x0001
export const CHUNK_HEADER_SIZE = 2 + 16 + 4 + 4 // 26 bytes

/**
 * Encode a chunk into a binary message.
 */
export function encodeChunk(
  transferId: string,
  chunkIndex: number,
  data: Buffer
): Buffer {
  const header = Buffer.alloc(CHUNK_HEADER_SIZE)

  // Message type
  header.writeUInt16BE(MSG_TYPE_CHUNK, 0)

  // Transfer ID as raw UUID bytes (strip hyphens, parse hex)
  const uuidHex = transferId.replace(/-/g, '')
  const uuidBytes = Buffer.from(uuidHex, 'hex')
  uuidBytes.copy(header, 2)

  // Chunk index
  header.writeUInt32BE(chunkIndex, 18)

  // Chunk size
  header.writeUInt32BE(data.length, 22)

  return Buffer.concat([header, data])
}

/**
 * Decode a binary chunk message.
 */
export function decodeChunk(msg: Buffer): {
  transferId: string
  chunkIndex: number
  data: Buffer
} {
  const msgType = msg.readUInt16BE(0)
  if (msgType !== MSG_TYPE_CHUNK) {
    throw new Error(`Unknown binary message type: 0x${msgType.toString(16)}`)
  }

  const uuidBytes = msg.subarray(2, 18)
  const hex = uuidBytes.toString('hex')
  const transferId = [
    hex.substring(0, 8),
    hex.substring(8, 12),
    hex.substring(12, 16),
    hex.substring(16, 20),
    hex.substring(20, 32)
  ].join('-')

  const chunkIndex = msg.readUInt32BE(18)
  const chunkSize = msg.readUInt32BE(22)
  const data = msg.subarray(CHUNK_HEADER_SIZE, CHUNK_HEADER_SIZE + chunkSize)

  return { transferId, chunkIndex, data }
}

// ── Message Serialization ──────────────────────────────────────────

/**
 * Frame format for messages over the tunnel:
 *   [1 byte]   frame type: 0x00 = JSON control, 0x01 = binary data
 *   [4 bytes]  payload length (uint32 big-endian)
 *   [N bytes]  payload
 */

export const FRAME_TYPE_CONTROL = 0x00
export const FRAME_TYPE_DATA = 0x01
export const FRAME_HEADER_SIZE = 5

export function encodeControlMessage(msg: ControlMessage): Buffer {
  const payload = Buffer.from(JSON.stringify(msg), 'utf-8')
  const frame = Buffer.alloc(FRAME_HEADER_SIZE + payload.length)
  frame.writeUInt8(FRAME_TYPE_CONTROL, 0)
  frame.writeUInt32BE(payload.length, 1)
  payload.copy(frame, FRAME_HEADER_SIZE)
  return frame
}

export function encodeDataMessage(data: Buffer): Buffer {
  const frame = Buffer.alloc(FRAME_HEADER_SIZE + data.length)
  frame.writeUInt8(FRAME_TYPE_DATA, 0)
  frame.writeUInt32BE(data.length, 1)
  data.copy(frame, FRAME_HEADER_SIZE)
  return frame
}

export function decodeFrame(frame: Buffer): {
  type: 'control' | 'data'
  payload: Buffer
} {
  const frameType = frame.readUInt8(0)
  const length = frame.readUInt32BE(1)
  const payload = frame.subarray(FRAME_HEADER_SIZE, FRAME_HEADER_SIZE + length)

  return {
    type: frameType === FRAME_TYPE_CONTROL ? 'control' : 'data',
    payload
  }
}

export function parseControlMessage(payload: Buffer): ControlMessage {
  return JSON.parse(payload.toString('utf-8')) as ControlMessage
}
