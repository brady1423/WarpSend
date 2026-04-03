/**
 * NAT Traversal — UDP hole punching + STUN integration.
 *
 * Before establishing an encrypted tunnel, we need to punch through NATs
 * so both peers can exchange UDP packets directly.
 *
 * Strategy:
 * 1. Use STUN to discover our public IP:port
 * 2. Exchange endpoints via connection strings
 * 3. Both sides send UDP probes to open NAT pinholes
 * 4. Once probes get through, establish the encrypted tunnel
 */

import dgram from 'dgram'
import { discoverPublicEndpoint, detectSymmetricNat } from './stun-client'

const PROBE_MAGIC = Buffer.from('WARP-PROBE')
const PROBE_INTERVAL = 500     // ms between probes
const PROBE_MAX_ATTEMPTS = 20  // 10 seconds of trying
const PROBE_TIMEOUT = 15000    // total timeout

export interface HolePunchResult {
  success: boolean
  localPort: number
  peerEndpoint: { host: string; port: number }
  isSymmetricNat: boolean
}

/**
 * Perform UDP hole punching to establish a path to the peer.
 *
 * Both sides must call this simultaneously for it to work.
 * The probes open NAT mappings that allow the peer's packets through.
 */
export function holePunch(
  peerHost: string,
  peerPort: number,
  localPort?: number
): Promise<HolePunchResult> {
  return new Promise((resolve, reject) => {
    const socket = dgram.createSocket('udp4')
    let attempts = 0
    let probeTimer: ReturnType<typeof setInterval> | null = null
    let resolved = false

    const cleanup = () => {
      if (probeTimer) clearInterval(probeTimer)
      // Don't close the socket — caller may reuse the port for the tunnel
    }

    const succeed = () => {
      if (resolved) return
      resolved = true
      cleanup()
      resolve({
        success: true,
        localPort: socket.address().port,
        peerEndpoint: { host: peerHost, port: peerPort },
        isSymmetricNat: false
      })
    }

    const fail = (reason: string) => {
      if (resolved) return
      resolved = true
      cleanup()
      socket.close()
      resolve({
        success: false,
        localPort: 0,
        peerEndpoint: { host: peerHost, port: peerPort },
        isSymmetricNat: false
      })
    }

    // Listen for incoming probes — if we get one, the hole is punched
    socket.on('message', (msg, rinfo) => {
      if (msg.length >= PROBE_MAGIC.length && msg.subarray(0, PROBE_MAGIC.length).equals(PROBE_MAGIC)) {
        // Got a probe response from the peer — NAT pinhole is open
        succeed()
      }
    })

    socket.on('error', (err) => {
      fail(err.message)
    })

    socket.bind(localPort || 0, () => {
      // Send probes at regular intervals
      probeTimer = setInterval(() => {
        attempts++
        if (attempts > PROBE_MAX_ATTEMPTS) {
          fail('Hole punch timeout — could not reach peer')
          return
        }

        // Send probe packet to peer's public endpoint
        const probe = Buffer.concat([
          PROBE_MAGIC,
          Buffer.from([attempts & 0xff])
        ])
        socket.send(probe, peerPort, peerHost)
      }, PROBE_INTERVAL)

      // Overall timeout
      setTimeout(() => {
        fail('Hole punch timed out')
      }, PROBE_TIMEOUT)
    })
  })
}

/**
 * Full NAT traversal flow:
 * 1. Discover our public endpoint via STUN
 * 2. Attempt hole punching to the peer
 * 3. Return the result with the local port to use for the tunnel
 */
export async function performNatTraversal(
  peerHost: string,
  peerPort: number
): Promise<HolePunchResult> {
  // First check if we're behind a symmetric NAT
  const isSymmetric = await detectSymmetricNat().catch(() => false)

  if (isSymmetric) {
    // Symmetric NAT — hole punching won't work reliably
    // Return failure so caller can try TURN or direct connection
    return {
      success: false,
      localPort: 0,
      peerEndpoint: { host: peerHost, port: peerPort },
      isSymmetricNat: true
    }
  }

  // Attempt hole punching
  const result = await holePunch(peerHost, peerPort)
  return result
}

/**
 * Get our public endpoint for sharing in connection strings.
 */
export async function getPublicEndpoint(): Promise<{ host: string; port: number }> {
  try {
    const stun = await discoverPublicEndpoint()
    return { host: stun.publicIp, port: stun.publicPort }
  } catch {
    // STUN failed — return placeholder
    return { host: '0.0.0.0', port: 0 }
  }
}
