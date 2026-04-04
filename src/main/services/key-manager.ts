import crypto from 'crypto'
import path from 'path'
import { app } from 'electron'
import Database from 'better-sqlite3'

interface DeviceKeys {
  publicKey: string   // base64-encoded 32-byte X25519 public key
  privateKey: string  // base64-encoded 32-byte X25519 private key
}

interface DeviceInfo {
  publicKey: string
  privateKey: string
  deviceName: string
  createdAt: string
}

let db: Database.Database | null = null

function getDb(): Database.Database {
  if (!db) {
    const dbPath = path.join(app.getPath('userData'), 'warpsend.db')
    db = new Database(dbPath)
    db.pragma('journal_mode = WAL')
    db.pragma('foreign_keys = ON')
    initSchema(db)
  }
  return db
}

function initSchema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS device (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      private_key TEXT NOT NULL,
      public_key TEXT NOT NULL,
      device_name TEXT NOT NULL DEFAULT 'WarpSend User',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS friends (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      public_key TEXT NOT NULL UNIQUE,
      last_known_endpoint TEXT,
      last_seen_at TEXT,
      is_online INTEGER NOT NULL DEFAULT 0,
      transfer_count INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transfer_queue (
      id TEXT PRIMARY KEY,
      friend_id TEXT NOT NULL REFERENCES friends(id),
      file_path TEXT NOT NULL,
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      chunks_sent INTEGER NOT NULL DEFAULT 0,
      total_chunks INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS transfer_history (
      id TEXT PRIMARY KEY,
      friend_id TEXT NOT NULL REFERENCES friends(id),
      file_name TEXT NOT NULL,
      file_size INTEGER NOT NULL,
      direction TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      completed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `)

  // Migration: add nickname column to friends
  const hasNickname = database.prepare(
    "SELECT COUNT(*) as cnt FROM pragma_table_info('friends') WHERE name='nickname'"
  ).get() as { cnt: number }
  if (hasNickname.cnt === 0) {
    database.exec('ALTER TABLE friends ADD COLUMN nickname TEXT')
  }
}

const ADJECTIVES = [
  'Swift', 'Neon', 'Cosmic', 'Shadow', 'Crimson', 'Azure', 'Golden', 'Silver',
  'Phantom', 'Stellar', 'Thunder', 'Crystal', 'Ember', 'Frost', 'Midnight',
  'Solar', 'Lunar', 'Storm', 'Nova', 'Blaze', 'Iron', 'Copper', 'Violet',
  'Onyx', 'Jade', 'Cobalt', 'Scarlet', 'Arctic', 'Turbo', 'Quantum',
  'Stealth', 'Rapid', 'Bright', 'Dark', 'Wild', 'Silent', 'Bold', 'Fierce',
  'Noble', 'Mystic', 'Primal', 'Rogue', 'Vivid', 'Hyper', 'Ultra', 'Mega',
  'Alpha', 'Omega', 'Zen', 'Apex'
]

const ANIMALS = [
  'Falcon', 'Panther', 'Wolf', 'Eagle', 'Tiger', 'Hawk', 'Lion', 'Bear',
  'Viper', 'Phoenix', 'Dragon', 'Shark', 'Raven', 'Fox', 'Lynx',
  'Cobra', 'Jaguar', 'Puma', 'Osprey', 'Orca', 'Mantis', 'Condor',
  'Raptor', 'Stallion', 'Mustang', 'Cheetah', 'Leopard', 'Badger',
  'Cougar', 'Bison', 'Crane', 'Heron', 'Sparrow', 'Orion', 'Coyote',
  'Moose', 'Elk', 'Ibis', 'Kite', 'Merlin', 'Peregrine', 'Stork',
  'Wren', 'Finch', 'Robin', 'Dove', 'Owl', 'Gecko', 'Mamba', 'Taipan'
]

function generateDeviceName(publicKey: string): string {
  const bytes = Buffer.from(publicKey, 'base64')
  const adjIndex = bytes[0] % ADJECTIVES.length
  const animalIndex = bytes[1] % ANIMALS.length
  return `${ADJECTIVES[adjIndex]} ${ANIMALS[animalIndex]}`
}

/**
 * Generate a new X25519 keypair for WireGuard.
 * Returns base64-encoded 32-byte keys.
 */
export function generateKeypair(): DeviceKeys {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519', {
    publicKeyEncoding: { type: 'spki', format: 'der' },
    privateKeyEncoding: { type: 'pkcs8', format: 'der' }
  })

  // X25519 DER-encoded SPKI public key: 12-byte header + 32-byte key
  const pubKeyRaw = publicKey.subarray(publicKey.length - 32)
  // X25519 DER-encoded PKCS8 private key: 16-byte header + 32-byte key
  const privKeyRaw = privateKey.subarray(privateKey.length - 32)

  return {
    publicKey: pubKeyRaw.toString('base64'),
    privateKey: privKeyRaw.toString('base64')
  }
}

/**
 * Get or create the device's WireGuard keypair.
 * Generated once on first launch, then persisted in SQLite.
 */
export function getOrCreateDeviceKeys(): DeviceInfo {
  const database = getDb()

  const existing = database.prepare('SELECT * FROM device WHERE id = 1').get() as DeviceInfo | undefined
  if (existing) {
    return {
      publicKey: existing.publicKey ?? (existing as Record<string, string>).public_key,
      privateKey: existing.privateKey ?? (existing as Record<string, string>).private_key,
      deviceName: existing.deviceName ?? (existing as Record<string, string>).device_name,
      createdAt: existing.createdAt ?? (existing as Record<string, string>).created_at
    }
  }

  const keys = generateKeypair()
  const deviceName = generateDeviceName(keys.publicKey)
  database.prepare(
    'INSERT INTO device (id, private_key, public_key, device_name) VALUES (1, ?, ?, ?)'
  ).run(keys.privateKey, keys.publicKey, deviceName)

  const created = database.prepare('SELECT * FROM device WHERE id = 1').get() as Record<string, string>
  return {
    publicKey: created.public_key,
    privateKey: created.private_key,
    deviceName: created.device_name,
    createdAt: created.created_at
  }
}

/**
 * Get the device's public key as a short ID (first 8 chars).
 */
export function getDeviceShortId(): string {
  const device = getOrCreateDeviceKeys()
  return '#' + Buffer.from(device.publicKey, 'base64')
    .toString('hex')
    .substring(0, 6)
    .toUpperCase()
}

/**
 * Update the device display name.
 */
export function setDeviceName(name: string): void {
  const database = getDb()
  database.prepare('UPDATE device SET device_name = ? WHERE id = 1').run(name)
}

/**
 * Get the raw database instance for other services to use.
 */
export function getDatabase(): Database.Database {
  return getDb()
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  if (db) {
    db.close()
    db = null
  }
}
