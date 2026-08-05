/**
 * Generates the small animated SVGs the README uses to show, rather than
 * describe, what the personalities do.
 *
 * One script, three personalities, three files. Same journey every time, so
 * the only variable on the page is the thing being demonstrated.
 *
 *   npm run build && node scripts/make-docs-assets.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { PERSONALITIES, scriptToSvg } from '../dist/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = resolve(here, '../assets')

const W = 420
const H = 230

const PAPER = '#faf8f4'
const INK = '#17161a'
const RULE = '#e2ddd3'
const MUTED = '#a8a298'
const ACCENT = '#2f6bff'

const FIELD = { x: 148, y: 89 }
const BUTTON = { x: 96, y: 142 }

const steps = [
  { action: 'move', point: FIELD, at: 0, duration: 600 },
  { action: 'click', point: FIELD, at: 600, duration: 280 },
  { action: 'move', point: BUTTON, at: 880, duration: 520 },
  { action: 'click', point: BUTTON, at: 1400, duration: 280 },
  { action: 'pause', at: 1680, duration: 500 },
]

const backdrop = `
<rect x="20" y="20" width="380" height="190" rx="10" fill="#fff" stroke="${RULE}" stroke-width="1.4"/>
<rect x="48" y="44" width="120" height="9" rx="4.5" fill="${INK}" opacity="0.8"/>
<rect x="48" y="72" width="200" height="34" rx="7" fill="#fff" stroke="${RULE}" stroke-width="1.4"/>
<rect x="62" y="84" width="86" height="9" rx="4.5" fill="${MUTED}" opacity="0.4"/>
<rect x="48" y="126" width="96" height="32" rx="7" fill="${INK}"/>
<rect x="66" y="138" width="60" height="8" rx="4" fill="#fff" opacity="0.9"/>
<rect x="278" y="72" width="94" height="86" rx="8" fill="${PAPER}" stroke="${RULE}" stroke-width="1.4"/>
<rect x="292" y="88" width="52" height="7" rx="3.5" fill="${MUTED}" opacity="0.5"/>
<rect x="292" y="104" width="66" height="6" rx="3" fill="${MUTED}" opacity="0.32"/>
<rect x="292" y="117" width="58" height="6" rx="3" fill="${MUTED}" opacity="0.32"/>
<rect x="48" y="180" width="70" height="7" rx="3.5" fill="${MUTED}" opacity="0.3"/>
`

mkdirSync(outDir, { recursive: true })

for (const name of ['confident', 'curious', 'caffeinated']) {
  const svg = scriptToSvg(
    {
      version: 1,
      viewport: { w: W, h: H },
      // A different seed per personality, so the three are not the same curve
      // wearing different clothes.
      seed: 4100 + name.length * 137,
      origin: { x: 60, y: 205 },
      steps,
    },
    {
      background: PAPER,
      color: ACCENT,
      label: false,
      traits: PERSONALITIES[name],
      backdrop,
      loop: true,
      fps: 30,
    },
  )

  const out = resolve(outDir, `personality-${name}.svg`)
  writeFileSync(out, svg)
  console.log(`  ${name.padEnd(12)} ${(Buffer.byteLength(svg) / 1024).toFixed(1)} kB  ${out}`)

  if (/<script/i.test(svg)) throw new Error(`${name}: contains a script tag`)
  if (/https?:\/\//.test(svg.replace(/\sxmlns="[^"]*"/g, ''))) {
    throw new Error(`${name}: references an external resource`)
  }
}
