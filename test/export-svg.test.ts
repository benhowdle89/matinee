import { describe, expect, it } from 'vitest'
import { scriptToSvg } from '../src/export-svg'
import { PERSONALITIES } from '../src/motion'
import type { Script } from '../src/script'
import { buildTimeline } from '../src/timeline'

const script: Script = {
  version: 1,
  viewport: { w: 1200, h: 630 },
  seed: 42,
  origin: { x: 100, y: 500 },
  steps: [
    { action: 'move', target: '#a', point: { x: 400, y: 200 }, at: 0, duration: 620 },
    { action: 'click', target: '#a', point: { x: 400, y: 200 }, at: 620, duration: 300 },
    { action: 'type', target: '#b', point: { x: 700, y: 340 }, text: 'hi', at: 920, duration: 900 },
    { action: 'pause', at: 1820, duration: 500 },
    { action: 'click', target: '#c', point: { x: 900, y: 500 }, at: 2320, duration: 700 },
  ],
}

function parse(svg: string): Document {
  const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
  const err = doc.querySelector('parsererror')
  if (err) throw new Error(`invalid SVG: ${err.textContent}`)
  return doc
}

/** happy-dom leaves `documentElement` null for image/svg+xml; query for it. */
function root(svg: string): Element {
  const el = parse(svg).querySelector('svg')
  if (!el) throw new Error('no <svg> root element')
  return el
}

function countKeyframes(svg: string, name: string): number {
  const block = new RegExp(`@keyframes ${name}\\{([\\s\\S]*?)\\}\\s*(?:@|$)`).exec(svg)
  if (!block) return 0
  return (block[1]?.match(/\d[\d.]*%\{/g) ?? []).length
}

describe('scriptToSvg', () => {
  it('produces parseable SVG', () => {
    const el = root(scriptToSvg(script))
    expect(el.getAttribute('xmlns')).toBe('http://www.w3.org/2000/svg')
    expect(el.getAttribute('viewBox')).toBe('0 0 1200 630')
  })

  it('is self-contained: no script, no external references', () => {
    const svg = scriptToSvg(script)
    expect(svg).not.toMatch(/<script/i)
    expect(svg).not.toMatch(/xlink:href|https?:\/\/(?!www\.w3\.org)/)
    expect(svg).not.toMatch(/@import|url\(/)
  })

  it('carries the whole journey as keyframes', () => {
    const svg = scriptToSvg(script)
    const timeline = buildTimeline(script, PERSONALITIES.confident, 24)
    expect(countKeyframes(svg, 'mt-travel')).toBe(timeline.samples.length)
    expect(countKeyframes(svg, 'mt-travel')).toBeGreaterThan(30)
  })

  it('fires one ripple per click, at the recorded moment', () => {
    const doc = parse(scriptToSvg(script))
    const ripples = doc.querySelectorAll('.mt-rip')
    expect(ripples).toHaveLength(3)

    const delays = Array.from(ripples).map((r) =>
      Number((r.getAttribute('style') ?? '').replace(/[^\d.]/g, '')),
    )
    expect(delays).toEqual([...delays].sort((a, b) => a - b))
    expect(delays[0]).toBeGreaterThan(0)
  })

  it('keeps every keyframe percentage inside 0..100 and in order', () => {
    const svg = scriptToSvg(script)
    const pcts = (svg.match(/([\d.]+)%\{transform:translate/g) ?? []).map((m) => parseFloat(m))
    expect(pcts.length).toBeGreaterThan(0)
    expect(Math.min(...pcts)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...pcts)).toBeLessThanOrEqual(100)
    expect(pcts).toEqual([...pcts].sort((a, b) => a - b))
  })

  it('is transparent by default and paints a background on request', () => {
    expect(scriptToSvg(script)).not.toMatch(/<rect width="100%"/)
    expect(scriptToSvg(script, { background: '#faf8f4' })).toMatch(
      /<rect width="100%" height="100%" fill="#faf8f4"/,
    )
  })

  it('honours reduced motion inside the file itself', () => {
    const svg = scriptToSvg(script)
    expect(svg).toMatch(/@media \(prefers-reduced-motion: no-preference\)/)
    // The resting transform sits outside the media query, so a reduced-motion
    // viewer still gets a composed still rather than an empty frame.
    const beforeMedia = svg.slice(0, svg.indexOf('@media'))
    expect(beforeMedia).toMatch(/\.mt-cursor\{transform:translate\(/)
  })

  it('loops by default and can be told not to', () => {
    expect(scriptToSvg(script)).toMatch(/mt-travel \d+ms linear infinite/)
    expect(scriptToSvg(script, { loop: false })).toMatch(/mt-travel \d+ms linear 1 forwards/)
  })

  it('scales via width while keeping the aspect ratio in the viewBox', () => {
    const el = root(scriptToSvg(script, { width: 600 }))
    expect(el.getAttribute('width')).toBe('600')
    expect(el.getAttribute('height')).toBe('315')
    expect(el.getAttribute('viewBox')).toBe('0 0 1200 630')
  })

  it('renders the nameplate, and drops it when asked', () => {
    expect(scriptToSvg(script, { label: 'Claude' })).toContain('>Claude<')
    expect(scriptToSvg(script, { label: false })).not.toContain('mt-chip-bg')
  })

  it('escapes a label rather than letting it break the document', () => {
    const svg = scriptToSvg(script, { label: '<script>&"' })
    expect(svg).toContain('&lt;script&gt;&amp;&quot;')
    expect(() => parse(svg)).not.toThrow()
  })

  it('takes a backdrop so a scene can be staged behind the cursor', () => {
    const svg = scriptToSvg(script, { backdrop: '<rect id="card" width="10" height="10"/>' })
    expect(parse(svg).querySelector('#card')).not.toBeNull()
  })

  it('survives an empty performance', () => {
    const empty: Script = { ...script, steps: [] }
    expect(() => parse(scriptToSvg(empty))).not.toThrow()
  })
})

describe('buildTimeline', () => {
  it('starts at the origin and never goes backwards in time', () => {
    const tl = buildTimeline(script, PERSONALITIES.confident, 24)
    expect(tl.samples[0]).toMatchObject({ t: 0, x: 100, y: 500 })
    for (let i = 1; i < tl.samples.length; i++) {
      expect(tl.samples[i]!.t).toBeGreaterThanOrEqual(tl.samples[i - 1]!.t)
    }
  })

  it('compresses stationary runs instead of emitting every idle frame', () => {
    const fps = 24
    const tl = buildTimeline(script, PERSONALITIES.confident, fps)
    const uncompressed = (tl.duration / 1000) * fps
    expect(tl.samples.length).toBeLessThan(uncompressed)
  })

  it('reaches every recorded landing point', () => {
    const tl = buildTimeline(script, PERSONALITIES.confident, 60)
    for (const step of script.steps) {
      if (!step.point) continue
      const hit = tl.samples.some(
        (s) => Math.hypot(s.x - step.point!.x, s.y - step.point!.y) < 1.5,
      )
      expect(hit, `never reached ${JSON.stringify(step.point)}`).toBe(true)
    }
  })

  it('is deterministic for a seed, so exports match the performance', () => {
    const a = buildTimeline(script, PERSONALITIES.confident, 24)
    const b = buildTimeline(script, PERSONALITIES.confident, 24)
    expect(a.samples).toEqual(b.samples)
  })
})
