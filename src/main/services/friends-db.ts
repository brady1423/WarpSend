/**
 * Friends database operations — CRUD for the friends table.
 */

import { v4 as uuidv4 } from 'uuid'
import { getDatabase } from './key-manager'

export interface FriendRow {
  id: string
  display_name: string
  nickname: string | null
  public_key: string
  last_known_endpoint: string | null
  last_seen_at: string | null
  is_online: number
  transfer_count: number
  created_at: string
}

export interface Friend {
  id: string
  displayName: string
  nickname: string | null
  publicKey: string
  lastKnownEndpoint: string | null
  lastSeenAt: string | null
  isOnline: boolean
  transferCount: number
  createdAt: string
}

function rowToFriend(row: FriendRow): Friend {
  return {
    id: row.id,
    displayName: row.display_name,
    nickname: row.nickname ?? null,
    publicKey: row.public_key,
    lastKnownEndpoint: row.last_known_endpoint,
    lastSeenAt: row.last_seen_at,
    isOnline: row.is_online === 1,
    transferCount: row.transfer_count,
    createdAt: row.created_at
  }
}

export function getAllFriends(): Friend[] {
  const db = getDatabase()
  const rows = db.prepare('SELECT * FROM friends ORDER BY display_name').all() as FriendRow[]
  return rows.map(rowToFriend)
}

export function getFriendById(id: string): Friend | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM friends WHERE id = ?').get(id) as FriendRow | undefined
  return row ? rowToFriend(row) : null
}

export function getFriendByPublicKey(publicKey: string): Friend | null {
  const db = getDatabase()
  const row = db.prepare('SELECT * FROM friends WHERE public_key = ?').get(publicKey) as FriendRow | undefined
  return row ? rowToFriend(row) : null
}

export function addFriend(
  displayName: string,
  publicKey: string,
  endpoint: string | null
): Friend {
  const db = getDatabase()
  const id = uuidv4()

  db.prepare(
    `INSERT INTO friends (id, display_name, public_key, last_known_endpoint)
     VALUES (?, ?, ?, ?)`
  ).run(id, displayName, publicKey, endpoint)

  return getFriendById(id)!
}

export function removeFriend(id: string): void {
  const db = getDatabase()
  // Delete related queue and history entries first
  db.prepare('DELETE FROM transfer_queue WHERE friend_id = ?').run(id)
  db.prepare('DELETE FROM transfer_history WHERE friend_id = ?').run(id)
  db.prepare('DELETE FROM friends WHERE id = ?').run(id)
}

export function updateFriendOnlineStatus(id: string, isOnline: boolean): void {
  const db = getDatabase()
  const updates: Record<string, unknown> = { is_online: isOnline ? 1 : 0 }
  if (isOnline) {
    updates.last_seen_at = new Date().toISOString()
  }
  db.prepare(
    'UPDATE friends SET is_online = ?, last_seen_at = COALESCE(?, last_seen_at) WHERE id = ?'
  ).run(updates.is_online, isOnline ? new Date().toISOString() : null, id)
}

export function updateFriendEndpoint(id: string, endpoint: string): void {
  const db = getDatabase()
  db.prepare('UPDATE friends SET last_known_endpoint = ? WHERE id = ?').run(endpoint, id)
}

export function incrementTransferCount(id: string): void {
  const db = getDatabase()
  db.prepare('UPDATE friends SET transfer_count = transfer_count + 1 WHERE id = ?').run(id)
}

export function updateFriendNickname(id: string, nickname: string): void {
  const db = getDatabase()
  db.prepare('UPDATE friends SET nickname = ? WHERE id = ?').run(nickname || null, id)
}

export function setAllFriendsOffline(): void {
  const db = getDatabase()
  db.prepare('UPDATE friends SET is_online = 0').run()
}
