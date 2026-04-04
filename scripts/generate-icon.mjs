/**
 * Generate the WarpSend app icon — minimalist portal ring on dark background.
 * Usage: node scripts/generate-icon.mjs
 */

import sharp from 'sharp'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SIZE = 512

// Colors
const BG_DARK = '#1a1a2e'
const BG_LIGHTER = '#16213e'
const TEAL = '#2dd4bf'
const TEAL_GLOW = '#2dd4bf'

const svg = `
<svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <!-- Background gradient -->
    <radialGradient id="bgGrad" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="${BG_LIGHTER}" />
      <stop offset="100%" stop-color="${BG_DARK}" />
    </radialGradient>

    <!-- Outer glow for the ring -->
    <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="12" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <!-- Inner glow (softer) -->
    <filter id="innerGlow" x="-50%" y="-50%" width="200%" height="200%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="20" result="blur" />
      <feMerge>
        <feMergeNode in="blur" />
        <feMergeNode in="blur" />
        <feMergeNode in="SourceGraphic" />
      </feMerge>
    </filter>

    <!-- Ring gradient for depth -->
    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#5eead4" />
      <stop offset="50%" stop-color="${TEAL}" />
      <stop offset="100%" stop-color="#14b8a6" />
    </linearGradient>

    <!-- Subtle highlight arc gradient -->
    <linearGradient id="highlightGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#99f6e4" stop-opacity="0.9" />
      <stop offset="100%" stop-color="${TEAL}" stop-opacity="0.1" />
    </linearGradient>
  </defs>

  <!-- Rounded square background -->
  <rect x="0" y="0" width="${SIZE}" height="${SIZE}" rx="100" ry="100" fill="url(#bgGrad)" />

  <!-- Subtle radial ambient light -->
  <circle cx="256" cy="256" r="140" fill="${TEAL_GLOW}" opacity="0.04" />

  <!-- Portal ring glow layer (outer) -->
  <circle cx="256" cy="256" r="130" fill="none" stroke="${TEAL_GLOW}" stroke-width="28" opacity="0.15" filter="url(#innerGlow)" />

  <!-- Main portal ring -->
  <circle cx="256" cy="256" r="130" fill="none" stroke="url(#ringGrad)" stroke-width="22" filter="url(#glow)" />

  <!-- Inner ring edge (thin highlight) -->
  <circle cx="256" cy="256" r="118" fill="none" stroke="${TEAL}" stroke-width="1.5" opacity="0.3" />

  <!-- Outer ring edge (thin highlight) -->
  <circle cx="256" cy="256" r="142" fill="none" stroke="${TEAL}" stroke-width="1" opacity="0.2" />

  <!-- Highlight arc on top-left for 3D depth -->
  <path d="M 170 150 A 130 130 0 0 1 340 165" fill="none" stroke="url(#highlightGrad)" stroke-width="4" stroke-linecap="round" />

  <!-- Center portal effect — small inner dot/glow -->
  <circle cx="256" cy="256" r="24" fill="${TEAL}" opacity="0.08" />
  <circle cx="256" cy="256" r="8" fill="${TEAL}" opacity="0.15" />

  <!-- Small send arrow in center -->
  <g transform="translate(256, 256)" opacity="0.6">
    <path d="M -12 8 L 0 -12 L 12 8 M 0 -10 L 0 16" fill="none" stroke="${TEAL}" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round" />
  </g>
</svg>`

const outputPath = join(__dirname, '..', 'resources', 'icon.png')

await sharp(Buffer.from(svg))
  .resize(512, 512)
  .png()
  .toFile(outputPath)

console.log(`Icon generated: ${outputPath}`)
