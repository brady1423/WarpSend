/**
 * Connection State Machine — tracks per-friend connection lifecycle.
 *
 * States:
 *   DISCONNECTED → RESOLVING_ENDPOINT → HOLE_PUNCHING → HANDSHAKING → CONNECTED
 *                                              ↓
 *                                       TURN_RELAY_ATTEMPT → CONNECTED_VIA_RELAY
 *                                              ↓
 *                                           FAILED
 */

import { EventEmitter } from 'events'

export type ConnectionState =
  | 'disconnected'
  | 'resolving'
  | 'hole_punching'
  | 'handshaking'
  | 'connected'
  | 'connected_relay'
  | 'failed'

export interface ConnectionInfo {
  friendId: string
  state: ConnectionState
  lastStateChange: number
  attempts: number
  error?: string
}

export class ConnectionStateMachine extends EventEmitter {
  private states = new Map<string, ConnectionInfo>()

  /**
   * Get the current state for a friend.
   */
  getState(friendId: string): ConnectionInfo {
    return this.states.get(friendId) ?? {
      friendId,
      state: 'disconnected',
      lastStateChange: Date.now(),
      attempts: 0
    }
  }

  /**
   * Transition to a new state.
   */
  transition(friendId: string, newState: ConnectionState, error?: string): void {
    const current = this.getState(friendId)
    const updated: ConnectionInfo = {
      friendId,
      state: newState,
      lastStateChange: Date.now(),
      attempts: newState === 'disconnected' ? 0 : current.attempts + (newState === 'resolving' ? 1 : 0),
      error
    }
    this.states.set(friendId, updated)
    this.emit('state-change', friendId, newState, current.state)
  }

  /**
   * Remove tracking for a friend.
   */
  remove(friendId: string): void {
    this.states.delete(friendId)
  }

  /**
   * Get all friends and their connection states.
   */
  getAllStates(): ConnectionInfo[] {
    return Array.from(this.states.values())
  }

  /**
   * Get a human-readable label for the UI.
   */
  static getDisplayLabel(state: ConnectionState): string {
    switch (state) {
      case 'disconnected': return 'Offline'
      case 'resolving': return 'Resolving...'
      case 'hole_punching': return 'Connecting...'
      case 'handshaking': return 'Handshaking...'
      case 'connected': return 'Online'
      case 'connected_relay': return 'Online (relayed)'
      case 'failed': return 'Connection failed'
    }
  }
}
