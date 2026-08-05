/**
 * Generates assets/hero.svg — matinee, made with matinee.
 *
 * This runs in plain Node with no browser and no headless anything, because
 * scriptToSvg() is a pure function of a Script: buildTimeline replays the
 * motion maths without touching the DOM. That is the simplest reliable route,
 * and it means CI could regenerate the hero if it ever needed to.
 *
 *   npm run build && node scripts/make-hero.mjs
 */

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { scriptToSvg, PERSONALITIES } from '../dist/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const out = resolve(here, '../assets/hero.svg')

const W = 1200
const H = 630

const PAPER = '#faf8f4'
const INK = '#17161a'
const RULE = '#e2ddd3'
const MUTED = '#a8a298'
const ACCENT = '#2f6bff'

/* The performance. Points are chosen to land on the wireframe below. */
const INPUT = { x: 440, y: 306 }
const BUTTON = { x: 284, y: 391 }
const PANEL = { x: 870, y: 300 }

const steps = [
  { action: 'move', point: INPUT, at: 0, duration: 700 },
  { action: 'click', point: INPUT, at: 700, duration: 320 },
  { action: 'type', point: INPUT, text: 'hello from matinee', at: 1020, duration: 1500 },
  { action: 'move', point: BUTTON, at: 2520, duration: 620 },
  { action: 'click', point: BUTTON, at: 3140, duration: 330 },
  { action: 'pause', at: 3470, duration: 700 },
  { action: 'move', point: PANEL, at: 4170, duration: 640 },
  { action: 'pause', at: 4810, duration: 900 },
]

const script = {
  version: 1,
  viewport: { w: W, h: H },
  seed: 20260805,
  origin: { x: 250, y: 592 },
  steps,
}

// buildTimeline adds a 700ms tail so the loop does not snap. The typing
// animation below has to agree with the exporter about how long a cycle is.
const TOTAL = steps[steps.length - 1].at + steps[steps.length - 1].duration + 700
const pct = (ms) => ((ms / TOTAL) * 100).toFixed(3)

/* Text starts at x=219 and the caret parks at x=367, so it walks 148px. */
const CARET_TRAVEL = 148

/* The stage set: a wireframe browser card. Deliberately flat and unbranded —
   it is scenery, and the cursor is the only thing with colour. */
const backdrop = `
<style>
.hw-text{font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.hw-typed{clip-path:inset(0 0 0 0)}
.hw-caret{opacity:0}
@media (prefers-reduced-motion: no-preference){
.hw-typed{animation:hw-type ${TOTAL}ms linear infinite}
.hw-caret{animation:hw-caret ${TOTAL}ms steps(1,end) infinite,hw-caret-x ${TOTAL}ms linear infinite}
}
@keyframes hw-type{
0%,${pct(1120)}%{clip-path:inset(0 100% 0 0)}
${pct(2500)}%{clip-path:inset(0 0 0 0)}
100%{clip-path:inset(0 0 0 0)}
}
@keyframes hw-caret{
0%,${pct(1050)}%{opacity:0}
${pct(1120)}%{opacity:1}
${pct(2560)}%{opacity:1}
${pct(2620)}%,100%{opacity:0}
}
/* The caret rides the end of the text rather than waiting at the far end of
   the field, in lockstep with the reveal above. */
@keyframes hw-caret-x{
0%,${pct(1120)}%{transform:translateX(-${CARET_TRAVEL}px)}
${pct(2500)}%{transform:translateX(0)}
100%{transform:translateX(0)}
}
</style>

<rect x="150" y="95" width="900" height="440" rx="14" fill="#fff" stroke="${RULE}" stroke-width="1.5"/>
<path d="M150 140 h900" stroke="${RULE}" stroke-width="1.5"/>
<circle cx="182" cy="118" r="5.5" fill="${RULE}"/>
<circle cx="203" cy="118" r="5.5" fill="${RULE}"/>
<circle cx="224" cy="118" r="5.5" fill="${RULE}"/>
<rect x="262" y="107" width="420" height="22" rx="11" fill="${PAPER}"/>

<rect x="200" y="186" width="286" height="16" rx="8" fill="${INK}" opacity="0.82"/>
<rect x="200" y="220" width="430" height="11" rx="5.5" fill="${MUTED}" opacity="0.5"/>
<rect x="200" y="243" width="330" height="11" rx="5.5" fill="${MUTED}" opacity="0.5"/>

<rect x="200" y="280" width="480" height="52" rx="9" fill="#fff" stroke="${RULE}" stroke-width="1.5"/>
<g class="hw-typed">
<text class="hw-text" x="219" y="312.5" font-size="16" fill="${INK}">hello from matinee</text>
</g>
<rect class="hw-caret" x="367" y="294" width="1.8" height="24" fill="${ACCENT}"/>

<rect x="200" y="366" width="168" height="50" rx="9" fill="${INK}"/>
<text class="hw-text" x="284" y="396.5" font-size="15" font-weight="600" fill="#fff" text-anchor="middle">Continue</text>

<rect x="730" y="186" width="280" height="230" rx="11" fill="${PAPER}" stroke="${RULE}" stroke-width="1.5"/>
<rect x="758" y="216" width="150" height="12" rx="6" fill="${MUTED}" opacity="0.55"/>
<rect x="758" y="248" width="224" height="9" rx="4.5" fill="${MUTED}" opacity="0.34"/>
<rect x="758" y="268" width="196" height="9" rx="4.5" fill="${MUTED}" opacity="0.34"/>
<rect x="758" y="288" width="210" height="9" rx="4.5" fill="${MUTED}" opacity="0.34"/>
<rect x="758" y="330" width="120" height="34" rx="8" fill="#fff" stroke="${RULE}" stroke-width="1.5"/>

<rect x="200" y="470" width="140" height="10" rx="5" fill="${MUTED}" opacity="0.32"/>
<rect x="360" y="470" width="96" height="10" rx="5" fill="${MUTED}" opacity="0.32"/>
`

const svg = scriptToSvg(script, {
  background: PAPER,
  color: ACCENT,
  label: 'Agent',
  traits: PERSONALITIES.confident,
  backdrop,
  loop: true,
  fps: 30,
})

mkdirSync(dirname(out), { recursive: true })
writeFileSync(out, svg)

const kb = (Buffer.byteLength(svg) / 1024).toFixed(1)
console.log(`wrote ${out}`)
console.log(`  ${kb} kB, ${TOTAL}ms loop`)
console.log(`  keyframes: ${(svg.match(/%\{transform:translate/g) ?? []).length}`)
console.log(`  ripples:   ${(svg.match(/class="mt-rip"/g) ?? []).length}`)
if (/<script/i.test(svg)) throw new Error('hero contains a <script> tag; GitHub will not run it')
if (/https?:\/\/(?!www\.w3\.org)/.test(svg)) throw new Error('hero references an external resource')
