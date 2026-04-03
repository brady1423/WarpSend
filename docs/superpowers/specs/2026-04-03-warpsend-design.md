# WarpSend Design Spec

## Context

LocalSend is a popular file-sharing app that works over local WiFi — but it can't send files to friends on different networks. WarpSend solves this by embedding a WireGuard VPN tunnel directly in the app, allowing peer-to-peer encrypted file transfers to anyone, anywhere on the internet. No accounts, no servers, no cloud storage — just install, pair with a code, and send.

## Overview

WarpSend is a free, open-source desktop app (Windows/Mac/Linux) for sending files to friends over encrypted WireGuard tunnels. It looks and feels like LocalSend but works across the internet, not just local networks.

**Core value proposition**: LocalSend's simplicity + internet-wide reach via built-in VPN.

## Architecture

Three-layer architecture:

```
┌─────────────────────────────────┐
│         Electron UI             │  React + Tailwind CSS
│   (LocalSend-inspired design)   │
├─────────────────────────────────┤
│       Transfer Engine           │  Node.js — chunked streaming,
│   (file chunking, queuing,      │  queue management, resume
│    progress tracking)           │
├─────────────────────────────────┤
│      WireGuard Tunnel Layer     │  boringtun (child process)
│   (VPN mesh, NAT traversal,    │  + STUN for NAT punch
│    peer connectivity)           │
└─────────────────────────────────┘
```

All data stored locally in SQLite: friend list, WireGuard keys, transfer history, queued files.

## Pairing & Connection

### First-Time Pairing
1. User A clicks "Add Friend" — app generates a **connection string** (~60 chars, e.g., `WARP-aBcDeFgHiJkLmNoPqRsTuVwXyZ012345678-203.0.113.5:51820`)
2. String encodes: WireGuard public key (32 bytes) + public IP + port, base64-compressed
3. User A copies and shares the string out-of-band (text, Discord, etc.)
4. User B pastes the string — app decodes it, establishes a WireGuard tunnel
5. User B's app sends its own key+endpoint back over the tunnel
6. Both devices save each other to their local friend list
7. Connection strings expire after 10 minutes or after use

### Reconnection
1. On app launch, tunnel layer tries to reconnect to all known friends
2. Uses last-known endpoint first, then STUN re-discovery
3. UDP hole punching for NAT traversal (~70% of home networks)
4. TURN relay fallback for symmetric NATs (data still encrypted E2E via WireGuard)
5. Friends show as online (connected) or offline (unreachable) in the UI

## File Transfer

### Sending Flow
1. User selects file(s)/folder(s) via picker or drag-and-drop
2. Selects an online friend from the friends list
3. App sends transfer request over WireGuard tunnel: file name, size, type
4. Recipient gets notification + accept/decline prompt
5. On accept, file streams in 64KB chunks over the encrypted tunnel
6. Progress bar on both sides: speed, percentage, ETA
7. File saved to recipient's configured download folder

### Offline Queue
- Sending to an offline friend adds files to a **send queue**
- Queue shows: file name, size, recipient, status
- When friend comes online, transfer starts automatically (friend still gets accept/decline prompt)
- Queued transfers can be cancelled anytime
- Queue persists across app restarts (stored in SQLite)
- Sender must keep app running for queued transfers to deliver

### Large File Handling
- Chunked streaming — no full-file buffering in memory
- Interrupted transfers resume from last completed chunk
- No file size limit — constrained only by disk space and connection speed

## UI Design

LocalSend-inspired dark theme with teal/mint accent color.

### Navigation Sidebar (narrow, left side)
- **Receive** — device identity, incoming transfer prompts
- **Send** — file/folder selection + online friends list
- **Friends** — manage friends, add via access code
- **Settings** — download folder, device name, theme, notifications

### Receive Tab
- Centered device icon (teal accent) with device name + short ID
- Shows your connection string for others to add you (with copy button)
- Incoming transfer requests appear as cards with accept/decline buttons

### Send Tab
- Top section: Selection buttons in card style — File, Folder, Text, Paste
- Below: "Friends" list (replaces LocalSend's "Nearby devices")
- Each friend shown as a card with device icon + name + online/offline indicator
- Click a friend to send selected files
- "Queued" badge on offline friends with pending transfers

### Friends Tab
- "Add Friend" button — shows your connection string (with copy button) + input field to paste a friend's string
- List of paired friends: status, last seen, transfer history count

### Settings Tab
- Device name
- Download folder location
- Theme (dark/light)
- Start on boot toggle
- Notification preferences

### General UI Elements
- System tray icon — app minimizes to tray, stays running for background transfers
- System notifications for incoming transfer requests
- Dark and light theme support

## Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Desktop shell | Electron | JS everywhere, cross-platform |
| UI framework | React + Tailwind CSS | Fast UI dev, easy dark theme styling |
| VPN tunnel | boringtun (userspace WireGuard) | Cloudflare's Rust impl, battle-tested |
| boringtun integration | Child process + IPC | Simpler build for v1, can optimize to native addon later |
| NAT traversal | STUN (public servers) + UDP hole punching | Free, no infrastructure |
| NAT fallback | TURN relay (free public servers) | For symmetric NATs |
| Local database | better-sqlite3 | Friend list, keys, transfer history, queue |
| File transfer | Custom protocol over WireGuard tunnel | Chunked TCP streaming with resume |
| Crypto | WireGuard built-in (Noise, ChaCha20-Poly1305) | All traffic encrypted by default |
| Packaging | electron-builder | Cross-platform installers |

## Security Model

- All traffic encrypted E2E via WireGuard (Noise protocol, ChaCha20-Poly1305)
- Identity = WireGuard keypair, generated on first launch, stored locally
- Connection strings are ephemeral — expire after use or after 10 minutes
- No passwords or accounts — private key never leaves the device
- Friend verification: both sides can view public key fingerprints for out-of-band verification
- Transfer consent: every incoming transfer requires explicit accept/decline
- No telemetry, no analytics, no phone-home — fully offline-capable between paired peers

## Verification Plan

### Unit Testing
- WireGuard key generation and connection string encode/decode
- File chunking and reassembly
- Queue persistence and state management
- Friend list CRUD operations

### Integration Testing
- Full pairing flow between two app instances on the same machine (loopback)
- File transfer end-to-end: send, receive, verify checksum
- Offline queue: queue file, simulate friend coming online, verify delivery
- Resume: interrupt transfer mid-stream, restart, verify completion

### Manual Testing
- Test across two machines on different networks (the core use case)
- NAT traversal: test from behind home routers
- Large file transfer (1GB+): verify streaming, no memory spikes
- System tray behavior: minimize, background transfer, notifications
- Cross-platform: verify on Windows, Mac, Linux
