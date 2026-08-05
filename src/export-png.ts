/**
 * A still of the journey: the path the cursor took, with a marker at every
 * click, on transparency. Cheap to produce and it drops straight onto a
 * screenshot in a slide.
 */

import { PERSONALITIES, type Traits } from './motion'
import type { Script } from './script'
import { buildTimeline } from './timeline'

export type PngOptions = {
  /** Output width in px. Defaults to the recorded viewport width. */
  width?: number
  color?: string
  traits?: Traits
  /** Multiplier for retina output. Defaults to the device pixel ratio. */
  pixelRatio?: number
  lineWidth?: number
}

const DEFAULT_COLOR = '#2f6bff'

export async function scriptToPathPng(script: Script, options: PngOptions = {}): Promise<Blob> {
  if (typeof document === 'undefined') {
    throw new Error('matinee: toPathPng() needs a browser')
  }

  const traits = options.traits ?? PERSONALITIES.confident
  const color = options.color ?? DEFAULT_COLOR
  const vw = script.viewport.w || 1200
  const vh = script.viewport.h || 630
  const width = options.width ?? vw
  const height = Math.round((width / vw) * vh)
  const dpr = options.pixelRatio ?? (typeof devicePixelRatio === 'number' ? devicePixelRatio : 1)

  const canvas = document.createElement('canvas')
  canvas.width = Math.round(width * dpr)
  canvas.height = Math.round(height * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('matinee: could not get a 2d context')

  // Draw in recorded-viewport coordinates and let the transform handle both
  // the requested size and the pixel density.
  ctx.scale((width / vw) * dpr, (height / vh) * dpr)

  const tl = buildTimeline(script, traits, 60)

  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  ctx.strokeStyle = color
  ctx.lineWidth = options.lineWidth ?? 2.5

  // Fade the tail in, so the path reads as having a direction.
  const n = tl.samples.length
  for (let i = 1; i < n; i++) {
    const a = tl.samples[i - 1]
    const b = tl.samples[i]
    if (!a || !b) continue
    ctx.globalAlpha = 0.12 + (i / n) * 0.68
    ctx.beginPath()
    ctx.moveTo(a.x, a.y)
    ctx.lineTo(b.x, b.y)
    ctx.stroke()
  }

  ctx.globalAlpha = 1
  for (const c of tl.clicks) {
    ctx.beginPath()
    ctx.arc(c.x, c.y, c.kind === 'dblclick' ? 13 : 10, 0, Math.PI * 2)
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.stroke()

    ctx.beginPath()
    ctx.arc(c.x, c.y, 3.5, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()
  }

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob)
      else reject(new Error('matinee: canvas produced no blob'))
    }, 'image/png')
  })
}
