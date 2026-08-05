/**
 * Turns a recorded Script back into positions over time.
 *
 * Both exporters need this: the SVG turns it into keyframes, the PNG turns it
 * into a stroked path. It runs with no DOM, which is what lets `toSvg()` be
 * called from a test, a build script, or a browser without three code paths.
 *
 * The reconstruction is faithful rather than bit-identical. It re-rolls the
 * curve between the same recorded landing points using the script's seed, so
 * the arcs are of the same character as the ones on screen without being the
 * exact same arcs. At 24fps over a nine-second clip nobody can tell, and the
 * alternative is storing thousands of sampled points in every script.
 */

import {
  buildPath,
  createRng,
  distanceBetween,
  driftAt,
  sampleMotion,
  travelDuration,
  type Point,
  type Traits,
} from './motion'
import { isPoint, type Script, type Step } from './script'

export type TimelineSample = { t: number; x: number; y: number }
export type TimelineClick = { t: number; x: number; y: number; kind: 'click' | 'dblclick' }

export type Timeline = {
  samples: TimelineSample[]
  clicks: TimelineClick[]
  /** Total length in ms, including a tail so a loop does not snap. */
  duration: number
}

const DEFAULT_FPS = 24
/** Below this, two consecutive samples are the same pixel to the eye. */
const MERGE_EPSILON = 0.4
/** A beat of stillness at the end so the loop reads as deliberate. */
const TAIL_MS = 700

export function buildTimeline(script: Script, traits: Traits, fps = DEFAULT_FPS): Timeline {
  const rng = createRng(script.seed)
  const step = 1000 / fps
  const samples: TimelineSample[] = []
  const clicks: TimelineClick[] = []

  let pos: Point = { ...script.origin }
  let time = 0

  const emit = (t: number, p: Point): void => {
    samples.push({ t, x: p.x, y: p.y })
  }

  const hold = (from: number, ms: number): void => {
    if (ms <= 0) return
    for (let t = from; t < from + ms; t += step) emit(t, pos)
  }

  /** Drift in place — what `pause` and `say` look like. */
  const wander = (from: number, ms: number): void => {
    if (ms <= 0) return
    const anchor = { ...pos }
    const phase = rng() * 100
    for (let t = from; t < from + ms; t += step) {
      const d = driftAt(t - from, traits, phase)
      emit(t, { x: anchor.x + d.x, y: anchor.y + d.y })
    }
    pos = anchor
  }

  /**
   * Travel, then stand still for whatever is left of the step's budget — the
   * hesitation, the click, the typing all happen without the cursor moving.
   */
  const travel = (from: number, to: Point, budget: number): number => {
    const dist = distanceBetween(pos, to)
    if (dist < 0.5) {
      hold(from, budget)
      pos = { ...to }
      return budget
    }
    const path = buildPath(pos, to, traits, rng)
    const dur = Math.min(travelDuration(dist, traits), Math.max(budget, 1))
    const phase = rng() * 100
    for (let t = from; t < from + dur; t += step) {
      emit(t, sampleMotion(path, (t - from) / dur, traits, phase))
    }
    pos = { ...to }
    emit(from + dur, pos)
    hold(from + dur, budget - dur)
    return dur
  }

  emit(0, pos)

  for (const s of script.steps) {
    // Dead air between steps is part of the rhythm; keep it.
    if (s.at > time) {
      hold(time, s.at - time)
      time = s.at
    }

    const target = targetPoint(s)

    switch (s.action) {
      case 'move':
      case 'hover': {
        if (target) travel(time, target, s.duration)
        else hold(time, s.duration)
        break
      }
      case 'click':
      case 'dblclick': {
        const travelled = target ? travel(time, target, s.duration) : (hold(time, s.duration), 0)
        // The press lands after the travel and the hesitation.
        clicks.push({
          t: time + travelled + traits.hesitation,
          x: pos.x,
          y: pos.y,
          kind: s.action,
        })
        break
      }
      case 'type': {
        if (target) {
          const travelled = travel(time, target, s.duration)
          clicks.push({ t: time + travelled + traits.hesitation, x: pos.x, y: pos.y, kind: 'click' })
        } else {
          hold(time, s.duration)
        }
        break
      }
      case 'scroll': {
        // The page moves, not the cursor — but it bobs, the way a hand resting
        // on a trackpad mid-swipe does.
        const anchor = { ...pos }
        for (let t = time; t < time + s.duration; t += step) {
          const p = (t - time) / Math.max(s.duration, 1)
          emit(t, { x: anchor.x + Math.sin(p * Math.PI) * 6, y: anchor.y + Math.sin(p * Math.PI) * 14 })
        }
        pos = anchor
        break
      }
      case 'pause':
      case 'say': {
        wander(time, s.duration)
        break
      }
      case 'show':
      case 'hide':
        break
    }

    time = s.at + s.duration
  }

  hold(time, TAIL_MS)
  emit(time + TAIL_MS, pos)

  return { samples: compress(samples), clicks, duration: Math.max(time + TAIL_MS, 1) }
}

function targetPoint(s: Step): Point | null {
  if (s.point) return s.point
  if (s.target !== undefined && isPoint(s.target)) return s.target
  return null
}

/**
 * Drops samples that sit inside a stationary run. A twelve-second performance
 * is mostly holding still; without this the keyframe block is several times
 * larger for no visible difference.
 */
function compress(samples: TimelineSample[]): TimelineSample[] {
  if (samples.length < 3) return samples
  const out: TimelineSample[] = [samples[0] as TimelineSample]

  for (let i = 1; i < samples.length - 1; i++) {
    const prev = out[out.length - 1] as TimelineSample
    const cur = samples[i] as TimelineSample
    const next = samples[i + 1] as TimelineSample
    const stillBehind = Math.hypot(cur.x - prev.x, cur.y - prev.y) < MERGE_EPSILON
    const stillAhead = Math.hypot(next.x - cur.x, next.y - cur.y) < MERGE_EPSILON
    if (stillBehind && stillAhead) continue
    out.push(cur)
  }

  out.push(samples[samples.length - 1] as TimelineSample)
  return out
}
