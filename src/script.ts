/**
 * A Script is the performance as plain data.
 *
 * It is recorded as the actor performs, never derived afterwards, and it is
 * JSON all the way down (no functions, no element references), so it can be
 * stored, posted, diffed, or handed to `play()` in a different session.
 */

import type { Point } from './motion'

export type ActionName =
  | 'move'
  | 'click'
  | 'dblclick'
  | 'type'
  | 'scroll'
  | 'hover'
  | 'pause'
  | 'say'
  | 'show'
  | 'hide'

export type Step = {
  action: ActionName
  /**
   * How to find the target again on replay. A selector when the caller gave
   * one (survives rerenders, reflows, and different viewport sizes); a point
   * when they gave coordinates or a bare element.
   */
  target?: string | Point
  /**
   * Where the cursor actually ended up. Redundant with `target` for point
   * targets, but for selector targets it is the difference between an export
   * that reproduces the performance and one that re-queries a page which has
   * since changed, and it lets exports run with no DOM at all.
   */
  point?: Point
  text?: string
  /** ms from the start of the performance. */
  at: number
  /** ms this step took. */
  duration: number
}

export type Script = {
  version: 1
  viewport: { w: number; h: number }
  /** Seeds the path randomness, so a replay traces the same curves. */
  seed: number
  /** Where the cursor was standing before the first step. */
  origin: Point
  steps: Step[]
}

export function emptyScript(
  seed: number,
  viewport: { w: number; h: number },
  origin: Point,
): Script {
  return { version: 1, viewport, seed, origin, steps: [] }
}

export function isPoint(t: Step['target']): t is Point {
  return typeof t === 'object' && t !== null && 'x' in t && 'y' in t
}

/**
 * Scripts recorded on a wide monitor and replayed on a laptop would otherwise
 * send the cursor off-screen. Selector targets re-resolve and need no help;
 * raw points get scaled proportionally.
 */
export function scalePoint(p: Point, from: Script['viewport'], to: Script['viewport']): Point {
  if (!from.w || !from.h) return p
  return { x: (p.x / from.w) * to.w, y: (p.y / from.h) * to.h }
}

export function validateScript(value: unknown): Script {
  if (typeof value !== 'object' || value === null) {
    throw new TypeError('matinee: script must be an object')
  }
  const s = value as Partial<Script>
  if (s.version !== 1) {
    throw new TypeError(`matinee: unsupported script version ${String(s.version)}`)
  }
  if (!Array.isArray(s.steps)) {
    throw new TypeError('matinee: script.steps must be an array')
  }
  return {
    version: 1,
    viewport: s.viewport ?? { w: 0, h: 0 },
    seed: typeof s.seed === 'number' ? s.seed : 1,
    origin: s.origin ?? { x: 0, y: 0 },
    steps: s.steps,
  }
}
