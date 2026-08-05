/**
 * Generates assets/og.svg — the 1200x630 social card.
 *
 * Writes SVG; rasterising to og.png is a separate step (see HANDOFF.md),
 * deliberately kept out of the package so matinee gains no dependency, dev or
 * otherwise, for the sake of one static image regenerated about never.
 *
 *   node scripts/make-og.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../assets/og.svg')

const W = 1200
const H = 630

const PAPER = '#faf8f4'
const INK = '#17161a'
const MUTED = '#6b6862'
const ACCENT = '#2f6bff'

/* The cursor's journey across the card, as one cubic bezier. Bowed the way
   the motion engine bows a real one — this is a poster of a movement. */
const P0 = { x: 150, y: 545 }
const C1 = { x: 380, y: 590 }
const C2 = { x: 700, y: 300 }
const P3 = { x: 892, y: 236 }

const bezier = (t) => {
  const u = 1 - t
  return {
    x: u ** 3 * P0.x + 3 * u * u * t * C1.x + 3 * u * t * t * C2.x + t ** 3 * P3.x,
    y: u ** 3 * P0.y + 3 * u * u * t * C1.y + 3 * u * t * t * C2.y + t ** 3 * P3.y,
  }
}

// The trail: denser and more solid as it approaches the cursor, the way the
// live one fades behind the head.
const DOTS = 26
const trail = Array.from({ length: DOTS }, (_, i) => {
  const f = i / (DOTS - 1)
  const p = bezier(0.1 + f * 0.86)
  const opacity = (0.06 + f * 0.3).toFixed(3)
  const r = (3.1 + f * 2.1).toFixed(2)
  return `<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${r}" fill="${ACCENT}" opacity="${opacity}"/>`
}).join('\n')

const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
<rect width="${W}" height="${H}" fill="${PAPER}"/>

${trail}

<g transform="translate(${P3.x},${P3.y})">
  <g transform="translate(-5,-2.5) scale(1.5)">
    <path d="M5 2.5 L5 19.4 L9.2 15.3 L11.9 21.2 L14.6 20 L11.9 14.2 L17.6 14.2 Z"
          fill="#fff" stroke="rgba(17,17,20,0.92)" stroke-width="1.35" stroke-linejoin="round"/>
  </g>
  <g transform="translate(22,25)">
    <rect width="74" height="30" rx="8" fill="${ACCENT}"/>
    <text x="13" y="20.5" font-family="ui-sans-serif,-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif"
          font-size="16" font-weight="600" fill="#fff">Agent</text>
  </g>
</g>

<text x="104" y="318" font-family="ui-serif,Georgia,'Times New Roman',serif" font-size="132"
      font-weight="500" letter-spacing="-4" fill="${INK}">matinee</text>

<text x="110" y="381" font-family="ui-serif,Georgia,'Times New Roman',serif" font-size="31"
      font-style="italic" fill="${MUTED}">staged cursor performances for React</text>

<text x="110" y="556" font-family="ui-monospace,SFMono-Regular,Menlo,monospace" font-size="21"
      fill="${MUTED}" opacity="0.85">npm install matinee</text>
</svg>
`

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, svg)
console.log(`wrote ${out}`)
