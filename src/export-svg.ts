/**
 * The animated SVG export — the flagship.
 *
 * Produces one self-contained file with no <script>, no external references,
 * and no fetches, because that is the exact shape GitHub's sandbox will render
 * when a README embeds it with <img>. Everything is inline: the keyframes, the
 * glyph, the nameplate, the colour.
 *
 * Motion is expressed as `transform: translate()` keyframes sampled from the
 * real motion function rather than as an `offset-path` sweep. Two reasons:
 * plain transform keyframes are supported by every renderer that will ever see
 * this, and — more importantly — they reproduce the overshoot and the tremor
 * exactly, because they *are* the sampled positions. An offset-path with an
 * easing function can only approximate the curve the audience actually
 * watched.
 */

import { PERSONALITIES, type Traits } from './motion'
import type { Script } from './script'
import { buildTimeline } from './timeline'

export type SvgOptions = {
  /** `'transparent'` (default) so it can sit on top of a screenshot. */
  background?: 'transparent' | string
  /** Rendered width in px. The viewBox keeps the aspect ratio. */
  width?: number
  loop?: boolean
  /** Nameplate text, or `false` for none. */
  label?: string | false
  color?: string
  /** Raw SVG markup drawn behind the cursor. Used to stage a scene. */
  backdrop?: string
  traits?: Traits
  fps?: number
}

const RIPPLE_MS = 620
const DEFAULT_COLOR = '#2f6bff'

export function scriptToSvg(script: Script, options: SvgOptions = {}): string {
  const traits = options.traits ?? PERSONALITIES.confident
  const color = options.color ?? DEFAULT_COLOR
  const label = options.label === undefined ? 'Agent' : options.label
  const loop = options.loop ?? true
  const background = options.background ?? 'transparent'

  const vw = script.viewport.w || 1200
  const vh = script.viewport.h || 630
  const width = options.width ?? vw
  const height = Math.round((width / vw) * vh)

  const tl = buildTimeline(script, traits, options.fps ?? 24)
  const total = tl.duration
  const last = tl.samples[tl.samples.length - 1] ?? { t: 0, x: 0, y: 0 }

  const travelFrames = tl.samples
    .map((s) => {
      const pct = round((s.t / total) * 100, 4)
      return `${pct}%{transform:translate(${round(s.x, 2)}px,${round(s.y, 2)}px)}`
    })
    .join('')

  const ripplePct = round((RIPPLE_MS / total) * 100, 4)
  const iteration = loop ? 'infinite' : '1'
  const fill = loop ? 'both' : 'forwards'

  const chip = label === false ? '' : chipMarkup(label)

  const chipCss =
    label === false
      ? ''
      : `\n.mt-chip-bg{fill:${color}}\n.mt-chip-tx{fill:#fff;font-family:ui-sans-serif,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;font-size:11.5px;font-weight:600;letter-spacing:.01em}`

  const css = `
.mt-cursor{transform:translate(${round(last.x, 2)}px,${round(last.y, 2)}px)}
.mt-rip{fill:none;stroke:${color};stroke-width:2;opacity:0;transform-box:fill-box;transform-origin:center}${chipCss}
@media (prefers-reduced-motion: no-preference){
.mt-cursor{animation:mt-travel ${total}ms linear ${iteration} ${fill}}
.mt-rip{animation:mt-ripple ${total}ms linear ${iteration} both}
}
@keyframes mt-travel{${travelFrames}}
@keyframes mt-ripple{
0%{opacity:.55;transform:scale(.12)}
${ripplePct}%{opacity:0;transform:scale(1)}
100%{opacity:0;transform:scale(1)}
}`.trim()

  const ripples = tl.clicks
    .map((c) => {
      const delay = round(Math.max(0, Math.min(c.t, total)), 1)
      const r = c.kind === 'dblclick' ? 26 : 20
      return `<circle class="mt-rip" cx="${round(c.x, 2)}" cy="${round(c.y, 2)}" r="${r}" style="animation-delay:${delay}ms"/>`
    })
    .join('')

  const bg =
    background === 'transparent' ? '' : `<rect width="100%" height="100%" fill="${esc(background)}"/>`

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${vw} ${vh}" role="img" aria-label="An animated cursor performance">
<style>${css}</style>
${bg}${options.backdrop ?? ''}
<g>${ripples}</g>
<g class="mt-cursor">
<g transform="translate(-5,-2.5)">
<path d="M5 2.5 L5 19.4 L9.2 15.3 L11.9 21.2 L14.6 20 L11.9 14.2 L17.6 14.2 Z" fill="#fff" stroke="rgba(17,17,20,0.92)" stroke-width="1.35" stroke-linejoin="round"/>
</g>${chip}
</g>
</svg>`
}

function chipMarkup(label: string): string {
  // No text metrics without a DOM, so approximate. The chip is a lozenge; a
  // few px of slack either way is invisible.
  const w = Math.max(34, label.length * 6.6 + 18)
  return `
<g transform="translate(15,17)">
<rect class="mt-chip-bg" width="${round(w, 1)}" height="21" rx="6"/>
<text class="mt-chip-tx" x="9" y="14.5">${esc(label)}</text>
</g>`
}

function round(v: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(v * f) / f
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
