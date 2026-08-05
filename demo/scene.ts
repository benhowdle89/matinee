/**
 * The scene the "Download as SVG" button exports.
 *
 * toSvg() exports the performance, never the page: it has no idea what your
 * app looks like, and matinee deliberately does not rasterise the DOM. On its
 * own that gives you a cursor on transparency, which is the right default for
 * laying over a screenshot you already have and a poor souvenir for someone
 * who just watched a demo.
 *
 * So the button exports a purpose-built take instead: a wireframe stage drawn
 * in SVG, and a short script over it, rendered with whichever personality,
 * nameplate and colour the visitor picked. It is a clip of matinee rather than
 * a recording of this page, and the copy beside the button says so.
 *
 * It also avoids scrolling on purpose. Recorded points are viewport
 * coordinates, and the export has no concept of scroll offset, so a
 * performance that scrolls cannot line up with any single static image.
 */

import type { Script } from 'matinee'

export const SCENE_W = 1000
export const SCENE_H = 560

const PAPER = '#faf8f4'
const INK = '#17161a'
const RULE = '#e2ddd3'
const MUTED = '#a8a298'

const INPUT = { x: 320, y: 235 }
const BUTTON = { x: 185, y: 312 }
const PANEL = { x: 730, y: 230 }

const STEPS: Script['steps'] = [
  { action: 'move', point: INPUT, at: 0, duration: 650 },
  { action: 'click', point: INPUT, at: 650, duration: 300 },
  { action: 'type', point: INPUT, text: 'hello from matinee', at: 950, duration: 1400 },
  { action: 'move', point: BUTTON, at: 2350, duration: 580 },
  { action: 'click', point: BUTTON, at: 2930, duration: 320 },
  { action: 'pause', at: 3250, duration: 600 },
  { action: 'move', point: PANEL, at: 3850, duration: 600 },
  { action: 'pause', at: 4450, duration: 800 },
]

/** buildTimeline appends a 700ms tail so the loop does not snap shut. */
const TAIL = 700
const TOTAL = 4450 + 800 + TAIL

const TEXT_X = 128
const CARET_X = 258
const CARET_TRAVEL = CARET_X - TEXT_X

export function sceneScript(): Script {
  return {
    version: 1,
    viewport: { w: SCENE_W, h: SCENE_H },
    seed: 20260805,
    origin: { x: 150, y: 505 },
    steps: STEPS,
  }
}

const pct = (ms: number): string => ((ms / TOTAL) * 100).toFixed(3)

/**
 * The stage set, plus the one thing the exporter cannot produce on its own:
 * text appearing as the cursor types it. Hand-timed against TOTAL, which is
 * why the constant above has to agree with the exporter.
 */
export function sceneBackdrop(accent: string): string {
  return `
<style>
.dw-t{font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.dw-typed{clip-path:inset(0 0 0 0)}
.dw-caret{opacity:0}
@media (prefers-reduced-motion: no-preference){
.dw-typed{animation:dw-type ${TOTAL}ms linear infinite}
.dw-caret{animation:dw-blink ${TOTAL}ms steps(1,end) infinite,dw-walk ${TOTAL}ms linear infinite}
}
@keyframes dw-type{
0%,${pct(1050)}%{clip-path:inset(0 100% 0 0)}
${pct(2300)}%{clip-path:inset(0 0 0 0)}
100%{clip-path:inset(0 0 0 0)}
}
@keyframes dw-blink{
0%,${pct(1000)}%{opacity:0}
${pct(1050)}%{opacity:1}
${pct(2340)}%{opacity:1}
${pct(2390)}%,100%{opacity:0}
}
@keyframes dw-walk{
0%,${pct(1050)}%{transform:translateX(-${CARET_TRAVEL}px)}
${pct(2300)}%{transform:translateX(0)}
100%{transform:translateX(0)}
}
</style>

<rect x="60" y="40" width="880" height="480" rx="14" fill="#fff" stroke="${RULE}" stroke-width="1.5"/>
<path d="M60 88 h880" stroke="${RULE}" stroke-width="1.5"/>
<circle cx="92" cy="64" r="5" fill="${RULE}"/>
<circle cx="112" cy="64" r="5" fill="${RULE}"/>
<circle cx="132" cy="64" r="5" fill="${RULE}"/>
<rect x="165" y="54" width="380" height="20" rx="10" fill="${PAPER}"/>

<rect x="110" y="130" width="250" height="14" rx="7" fill="${INK}" opacity="0.82"/>
<rect x="110" y="158" width="380" height="10" rx="5" fill="${MUTED}" opacity="0.5"/>
<rect x="110" y="176" width="300" height="10" rx="5" fill="${MUTED}" opacity="0.5"/>

<rect x="110" y="212" width="420" height="46" rx="8" fill="#fff" stroke="${RULE}" stroke-width="1.5"/>
<g class="dw-typed">
<text class="dw-t" x="${TEXT_X}" y="241" font-size="15" fill="${INK}">hello from matinee</text>
</g>
<rect class="dw-caret" x="${CARET_X}" y="225" width="1.6" height="21" fill="${accent}"/>

<rect x="110" y="290" width="150" height="44" rx="8" fill="${INK}"/>
<text class="dw-t" x="185" y="317" font-size="14" font-weight="600" fill="#fff" text-anchor="middle">Continue</text>

<rect x="580" y="130" width="300" height="204" rx="11" fill="${PAPER}" stroke="${RULE}" stroke-width="1.5"/>
<rect x="606" y="158" width="140" height="11" rx="5.5" fill="${MUTED}" opacity="0.55"/>
<rect x="606" y="186" width="238" height="8" rx="4" fill="${MUTED}" opacity="0.34"/>
<rect x="606" y="204" width="206" height="8" rx="4" fill="${MUTED}" opacity="0.34"/>
<rect x="606" y="222" width="222" height="8" rx="4" fill="${MUTED}" opacity="0.34"/>
<rect x="606" y="262" width="112" height="32" rx="8" fill="#fff" stroke="${RULE}" stroke-width="1.5"/>

<rect x="110" y="452" width="130" height="9" rx="4.5" fill="${MUTED}" opacity="0.32"/>
<rect x="260" y="452" width="90" height="9" rx="4.5" fill="${MUTED}" opacity="0.32"/>
`
}

export const SCENE_BACKGROUND = PAPER
