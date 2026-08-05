/**
 * Generates the README's export gallery: one performance, rendered every way
 * matinee can render it, so the docs can show what each option actually
 * produces instead of describing it.
 *
 * The SVGs are written here in plain Node. The PNG needs a real canvas, so it
 * is produced separately (see HANDOFF.md).
 *
 *   npm run build && node scripts/make-export-examples.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scriptToSvg } from '../dist/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../assets')

const W = 560
const H = 260

const PAPER = '#faf8f4'
const INK = '#17161a'
const RULE = '#e2ddd3'
const MUTED = '#a8a298'
const ACCENT = '#2f6bff'

const INPUT = { x: 196, y: 120 }
const BUTTON = { x: 111, y: 175 }

/** One performance. Every artefact below is this same script. */
export const script = {
  version: 1,
  viewport: { w: W, h: H },
  seed: 90210,
  origin: { x: 70, y: 232 },
  steps: [
    { action: 'move', point: INPUT, at: 0, duration: 560 },
    { action: 'click', point: INPUT, at: 560, duration: 300 },
    { action: 'move', point: BUTTON, at: 860, duration: 480 },
    { action: 'click', point: BUTTON, at: 1340, duration: 300 },
    { action: 'pause', at: 1640, duration: 500 },
  ],
}

/** Raw SVG scenery, drawn behind the cursor when a clip is wanted. */
export const backdrop = `
<rect x="24" y="24" width="512" height="212" rx="10" fill="#fff" stroke="${RULE}" stroke-width="1.4"/>
<path d="M24 64 h512" stroke="${RULE}" stroke-width="1.4"/>
<circle cx="46" cy="44" r="4.5" fill="${RULE}"/>
<circle cx="63" cy="44" r="4.5" fill="${RULE}"/>
<circle cx="80" cy="44" r="4.5" fill="${RULE}"/>
<rect x="56" y="84" width="140" height="10" rx="5" fill="${INK}" opacity="0.8"/>
<rect x="56" y="104" width="280" height="32" rx="7" fill="#fff" stroke="${RULE}" stroke-width="1.4"/>
<rect x="70" y="115" width="90" height="9" rx="4.5" fill="${MUTED}" opacity="0.4"/>
<rect x="56" y="160" width="110" height="30" rx="7" fill="${INK}"/>
<rect x="74" y="171" width="74" height="8" rx="4" fill="#fff" opacity="0.9"/>
<rect x="368" y="88" width="144" height="102" rx="8" fill="${PAPER}" stroke="${RULE}" stroke-width="1.4"/>
<rect x="384" y="106" width="72" height="8" rx="4" fill="${MUTED}" opacity="0.5"/>
<rect x="384" y="124" width="104" height="6" rx="3" fill="${MUTED}" opacity="0.32"/>
<rect x="384" y="138" width="88" height="6" rx="3" fill="${MUTED}" opacity="0.32"/>
<rect x="56" y="210" width="88" height="7" rx="3.5" fill="${MUTED}" opacity="0.3"/>
`

if (import.meta.url === `file://${process.argv[1]}`) {
  mkdirSync(outDir, { recursive: true })

  const variants = [
    {
      file: 'export-overlay.svg',
      note: 'default: transparent, cursor only',
      options: { label: 'Agent', color: ACCENT, fps: 30 },
    },
    {
      file: 'export-clip.svg',
      note: 'background + backdrop: a self-contained clip',
      options: { label: 'Agent', color: ACCENT, fps: 30, background: PAPER, backdrop },
    },
    {
      file: 'export-styled.svg',
      note: 'a different colour and nameplate',
      options: {
        label: 'Claude',
        color: '#c2410c',
        fps: 30,
        background: '#fffaf5',
        backdrop: backdrop.replaceAll(ACCENT, '#c2410c'),
      },
    },
  ]

  for (const { file, note, options } of variants) {
    const svg = scriptToSvg(script, options)
    writeFileSync(resolve(outDir, file), svg)
    console.log(`  ${file.padEnd(24)} ${(Buffer.byteLength(svg) / 1024).toFixed(1)} kB  ${note}`)
    if (/<script/i.test(svg)) throw new Error(`${file}: contains a script tag`)
    if (/https?:\/\//.test(svg.replace(/\sxmlns="[^"]*"/g, ''))) {
      throw new Error(`${file}: references an external resource`)
    }
  }
}
