/**
 * Integration test for the transfer engine.
 *
 * Creates a mock TunnelManager that acts as a loopback: the sender's outgoing
 * messages are routed directly to the receiver's engine, and vice versa.
 * This lets us test the full chunked-transfer flow (including retransmission
 * under simulated packet loss) without any real networking or Electron.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import os from 'os'
import { EventEmitter } from 'events'
import {
  CHUNK_SIZE,
  encodeControlMessage,
  encodeDataMessage,
  decodeFrame,
  parseControlMessage,
  FRAME_HEADER_SIZE,
  type ControlMessage
} from '../protocol'

// ── Mock electron's app module ──────────────────────────────────────
vi.mock('electron', () => ({
  app: {
    getPath: (name: string) => {
      if (name === 'downloads') return os.tmpdir()
      return os.tmpdir()
    }
  }
}))

import { TransferEngine, type ActiveTransfer } from '../transfer-engine'

// ── Mock TunnelManager ──────────────────────────────────────────────
// A lightweight EventEmitter that captures sent frames and can replay
// them to simulate loopback delivery.

class MockTunnelManager extends EventEmitter {
  sentControlMessages: { friendId: string; message: ControlMessage }[] = []
  sentDataBuffers: { friendId: string; data: Buffer }[] = []
  dropRate = 0 // 0-1, fraction of data messages to silently drop

  sendControl(friendId: string, message: ControlMessage): void {
    this.sentControlMessages.push({ friendId, message })
  }

  sendData(friendId: string, data: Buffer): void {
    this.sentDataBuffers.push({ friendId, data })
  }
}

// ── Helpers ─────────────────────────────────────────────────────────

function sha256(filePath: string): string {
  const hash = crypto.createHash('sha256')
  hash.update(fs.readFileSync(filePath))
  return hash.digest('hex')
}

/** Generate a random binary file of the given size. */
function createTestFile(dir: string, name: string, sizeBytes: number): string {
  const filePath = path.join(dir, name)
  const buf = crypto.randomBytes(sizeBytes)
  fs.writeFileSync(filePath, buf)
  return filePath
}

/**
 * Wire two mock tunnel managers + engines together so that control/data
 * messages sent by engine A are delivered to engine B, and vice versa.
 *
 * `dropRate` (0–1) controls what fraction of *data* messages are silently
 * dropped to simulate UDP packet loss. Control messages are never dropped
 * (they're small JSON and rarely lost in practice).
 */
function createLoopback(dropRate = 0) {
  const tmA = new MockTunnelManager()
  const tmB = new MockTunnelManager()

  const engineA = new TransferEngine(tmA as any)
  const engineB = new TransferEngine(tmB as any)

  const FRIEND_ID_A = 'friend-a'
  const FRIEND_ID_B = 'friend-b'

  // Intercept A's sends and deliver to B
  const origSendControlA = tmA.sendControl.bind(tmA)
  tmA.sendControl = (friendId: string, message: ControlMessage) => {
    origSendControlA(friendId, message)
    // Deliver to B on next tick (simulates async network)
    setImmediate(() => {
      tmB.emit('control-message', FRIEND_ID_A, message)
    })
  }
  tmA.sendData = (friendId: string, data: Buffer) => {
    tmA.sentDataBuffers.push({ friendId, data })
    if (dropRate > 0 && Math.random() < dropRate) return // simulate loss
    setImmediate(() => {
      tmB.emit('data-message', FRIEND_ID_A, data)
    })
  }

  // Intercept B's sends and deliver to A
  const origSendControlB = tmB.sendControl.bind(tmB)
  tmB.sendControl = (friendId: string, message: ControlMessage) => {
    origSendControlB(friendId, message)
    setImmediate(() => {
      tmA.emit('control-message', FRIEND_ID_B, message)
    })
  }
  tmB.sendData = (friendId: string, data: Buffer) => {
    tmB.sentDataBuffers.push({ friendId, data })
    if (dropRate > 0 && Math.random() < dropRate) return
    setImmediate(() => {
      tmA.emit('data-message', FRIEND_ID_B, data)
    })
  }

  return { tmA, tmB, engineA, engineB, FRIEND_ID_A, FRIEND_ID_B }
}

// ── Tests ───────────────────────────────────────────────────────────

describe('TransferEngine', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'warpsend-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  it('transfers a small file (< 1 chunk) end-to-end', async () => {
    const { engineA, engineB, FRIEND_ID_B } = createLoopback()
    engineB.setDownloadFolder(tmpDir)

    // Create a small test file (500 bytes)
    const srcPath = createTestFile(tmpDir, 'small.txt', 500)
    const srcHash = sha256(srcPath)

    // Sender initiates transfer
    const transfer = await engineA.initiateTransfer(FRIEND_ID_B, srcPath)

    // Wait for receiver to get the incoming-transfer event
    const incomingTransfer = await new Promise<any>((resolve) => {
      engineB.on('incoming-transfer', resolve)
    })
    expect(incomingTransfer.fileName).toBe('small.txt')
    expect(incomingTransfer.fileSize).toBe(500)

    // Receiver accepts
    engineB.acceptTransfer(incomingTransfer.transferId)

    // Wait for both sides to report completion
    await Promise.all([
      new Promise<void>((resolve) => {
        engineA.on('transfer-complete', (id: string, dir: string) => {
          if (dir === 'sending') resolve()
        })
      }),
      new Promise<void>((resolve) => {
        engineB.on('transfer-complete', (id: string, dir: string) => {
          if (dir === 'receiving') resolve()
        })
      })
    ])

    // Verify the received file matches
    const receivedFiles = fs.readdirSync(tmpDir).filter(f => f === 'small.txt' || f.startsWith('small'))
    const receivedPath = path.join(tmpDir, receivedFiles.find(f => !f.endsWith('.warpsend-partial') && f !== path.basename(srcPath))!)
    // The source file lives in tmpDir too, so the received file gets a unique name
    const candidates = fs.readdirSync(tmpDir).filter(f => f.startsWith('small') && !f.endsWith('.warpsend-partial'))
    // Find the one that isn't the original
    let recvFile: string | undefined
    for (const c of candidates) {
      const cp = path.join(tmpDir, c)
      if (cp !== srcPath && fs.existsSync(cp)) {
        recvFile = cp
        break
      }
    }
    expect(recvFile).toBeDefined()
    expect(sha256(recvFile!)).toBe(srcHash)
  })

  it('transfers a multi-chunk binary file end-to-end', async () => {
    const { engineA, engineB, FRIEND_ID_B } = createLoopback()
    engineB.setDownloadFolder(tmpDir)

    // 200KB file = ~13 chunks at 16KB each
    const srcPath = createTestFile(tmpDir, 'binary.bin', 200 * 1024)
    const srcHash = sha256(srcPath)

    const transfer = await engineA.initiateTransfer(FRIEND_ID_B, srcPath)

    const incomingTransfer = await new Promise<any>((resolve) => {
      engineB.on('incoming-transfer', resolve)
    })
    engineB.acceptTransfer(incomingTransfer.transferId)

    await Promise.all([
      new Promise<void>((resolve) => {
        engineA.on('transfer-complete', (id: string, dir: string) => {
          if (dir === 'sending') resolve()
        })
      }),
      new Promise<void>((resolve) => {
        engineB.on('transfer-complete', (id: string, dir: string) => {
          if (dir === 'receiving') resolve()
        })
      })
    ])

    const candidates = fs.readdirSync(tmpDir).filter(
      f => f.startsWith('binary') && !f.endsWith('.warpsend-partial')
    )
    let recvFile: string | undefined
    for (const c of candidates) {
      const cp = path.join(tmpDir, c)
      if (cp !== srcPath) { recvFile = cp; break }
    }
    expect(recvFile).toBeDefined()
    expect(fs.statSync(recvFile!).size).toBe(200 * 1024)
    expect(sha256(recvFile!)).toBe(srcHash)
  })

  it('completes transfer despite 30% simulated packet loss (retransmission)', async () => {
    // 30% drop rate — enough to trigger retransmission on most chunks
    const { engineA, engineB, FRIEND_ID_B } = createLoopback(0.3)
    engineB.setDownloadFolder(tmpDir)

    // 100KB file = ~7 chunks
    const srcPath = createTestFile(tmpDir, 'lossy.bin', 100 * 1024)
    const srcHash = sha256(srcPath)

    const transfer = await engineA.initiateTransfer(FRIEND_ID_B, srcPath)

    const incomingTransfer = await new Promise<any>((resolve) => {
      engineB.on('incoming-transfer', resolve)
    })
    engineB.acceptTransfer(incomingTransfer.transferId)

    // This test needs more time due to retransmission delays (ACK_TIMEOUT = 5s)
    await Promise.all([
      new Promise<void>((resolve) => {
        engineA.on('transfer-complete', (id: string, dir: string) => {
          if (dir === 'sending') resolve()
        })
      }),
      new Promise<void>((resolve) => {
        engineB.on('transfer-complete', (id: string, dir: string) => {
          if (dir === 'receiving') resolve()
        })
      })
    ])

    const candidates = fs.readdirSync(tmpDir).filter(
      f => f.startsWith('lossy') && !f.endsWith('.warpsend-partial')
    )
    let recvFile: string | undefined
    for (const c of candidates) {
      const cp = path.join(tmpDir, c)
      if (cp !== srcPath) { recvFile = cp; break }
    }
    expect(recvFile).toBeDefined()
    expect(fs.statSync(recvFile!).size).toBe(100 * 1024)
    expect(sha256(recvFile!)).toBe(srcHash)
  }, 60_000) // 60s timeout for retransmission test

  it('handles transfer cancellation and cleans up partial file', async () => {
    const { engineA, engineB, FRIEND_ID_B } = createLoopback()
    engineB.setDownloadFolder(tmpDir)

    const srcPath = createTestFile(tmpDir, 'cancel-me.bin', 100 * 1024)
    const transfer = await engineA.initiateTransfer(FRIEND_ID_B, srcPath)

    const incomingTransfer = await new Promise<any>((resolve) => {
      engineB.on('incoming-transfer', resolve)
    })
    engineB.acceptTransfer(incomingTransfer.transferId)

    // Wait a tick for at least one chunk to be sent, then cancel
    await new Promise((r) => setTimeout(r, 50))
    engineB.cancelTransfer(incomingTransfer.transferId)

    // Give cleanup a moment
    await new Promise((r) => setTimeout(r, 100))

    // The partial file should have been deleted
    const partials = fs.readdirSync(tmpDir).filter(f => f.endsWith('.warpsend-partial'))
    expect(partials.length).toBe(0)
  })

  it('decline prevents any file from being written', async () => {
    const { engineA, engineB, FRIEND_ID_B } = createLoopback()
    engineB.setDownloadFolder(tmpDir)

    const srcPath = createTestFile(tmpDir, 'declined.bin', 50 * 1024)
    await engineA.initiateTransfer(FRIEND_ID_B, srcPath)

    const incomingTransfer = await new Promise<any>((resolve) => {
      engineB.on('incoming-transfer', resolve)
    })

    engineB.declineTransfer(incomingTransfer.transferId)
    await new Promise((r) => setTimeout(r, 100))

    const received = fs.readdirSync(tmpDir).filter(
      f => f.includes('declined') && !f.endsWith('.warpsend-partial') && f !== 'declined.bin'
    )
    expect(received.length).toBe(0)
  })
})
