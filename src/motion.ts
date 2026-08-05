/**
 * The motion engine.
 *
 * Everything here exists to answer one question: would this fool you in a
 * nine-second clip? A cursor that lerps between two points reads as a computer
 * immediately. What reads as a hand is:
 *
 *   - a curved path, never the same curve twice
 *   - a minimum-jerk velocity profile (the actual model for human reaching)
 *   - arriving slightly past the target and settling back
 *   - a sub-pixel tremor that never quite stops
 *
 * No dependencies, no allocations in the hot path, all pure functions so the
 * maths can be tested without a DOM.
 */

export type Point = { x: number; y: number }

export type PersonalityName = 'confident' | 'curious' | 'caffeinated'

export type Traits = {
  /** Multiplier on travel time. Lower is faster. */
  pace: number
  /** Perpendicular bow of the path, as a fraction of the distance travelled. */
  curvature: number
  /** How much the curvature varies journey to journey, 0..1. */
  curvatureJitter: number
  /** Peak overshoot past the target, as a fraction of distance. */
  overshoot: number
  /** Ceiling on overshoot in px, so long journeys don't fly off. */
  overshootMax: number
  /** Amplitude of the sub-pixel tremor while moving, in px. */
  tremor: number
  /** Radius of the idle wander while paused, in px. */
  drift: number
  /** Speed of the idle wander. */
  driftRate: number
  /** Per-keystroke delay range, in ms. */
  keystroke: [number, number]
  /** Pause before committing to a click, in ms. Humans hesitate. */
  hesitation: number
}

export const PERSONALITIES: Record<PersonalityName, Traits> = {
  confident: {
    pace: 1,
    curvature: 0.12,
    curvatureJitter: 0.4,
    overshoot: 0.035,
    overshootMax: 22,
    tremor: 0.35,
    drift: 1.6,
    driftRate: 0.6,
    keystroke: [55, 130],
    hesitation: 70,
  },
  curious: {
    pace: 1.45,
    curvature: 0.3,
    curvatureJitter: 0.75,
    overshoot: 0.015,
    overshootMax: 10,
    tremor: 0.5,
    drift: 4.2,
    driftRate: 0.45,
    keystroke: [90, 260],
    hesitation: 220,
  },
  caffeinated: {
    pace: 0.62,
    curvature: 0.18,
    curvatureJitter: 0.55,
    overshoot: 0.075,
    overshootMax: 40,
    tremor: 0.9,
    drift: 2.4,
    driftRate: 2.1,
    keystroke: [28, 78],
    hesitation: 25,
  },
}

export function traitsFor(p: PersonalityName | Traits | undefined): Traits {
  if (!p) return PERSONALITIES.confident
  if (typeof p === 'string') return PERSONALITIES[p] ?? PERSONALITIES.confident
  return p
}

/* -------------------------------------------------------------------------- */
/* Randomness                                                                  */
/* -------------------------------------------------------------------------- */

/**
 * mulberry32. Seeded so a Script replays the same way twice — which is what
 * lets the SVG export match the performance the viewer actually watched.
 */
export function createRng(seed: number): () => number {
  let a = seed >>> 0
  return function rng() {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A random number in [min, max). */
export function between(rng: () => number, min: number, max: number): number {
  return min + rng() * (max - min)
}

/* -------------------------------------------------------------------------- */
/* Easing                                                                      */
/* -------------------------------------------------------------------------- */

/**
 * Minimum-jerk trajectory: 10t³ - 15t⁴ + 6t⁵.
 *
 * This is not an ease picked by eye. It is the standard model from motor
 * control research for how a human arm moves between two points — smooth
 * start, fast middle, smooth arrival, zero velocity and acceleration at both
 * ends. It is the single highest-leverage line in this file.
 */
export function minimumJerk(t: number): number {
  const c = clamp01(t)
  return c * c * c * (10 - 15 * c + 6 * c * c)
}

export function clamp01(t: number): number {
  return t < 0 ? 0 : t > 1 ? 1 : t
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v
}

/**
 * The last quarter of every journey is the correction, not the travel.
 *
 * Human reaching is two movements, not one: a fast ballistic throw that lands
 * slightly wrong, then a small corrective submovement. Modelling it as one
 * smooth arrival is what makes tweened cursors read as fake.
 *
 * So the travel ease completes at `1 - SETTLE_FRACTION`, parked a few px past
 * the target, and the remainder walks it back. Both halves are minimum-jerk
 * and both meet at zero velocity, so there is no visible kink at the handoff.
 */
const SETTLE_FRACTION = 0.26
/** Overshoot stays at zero until the approach is well under way. */
const OVERSHOOT_RAMP_START = 0.55

/**
 * How far past the target the cursor is, as a fraction of the full overshoot.
 * Zero at both ends, exactly 1.0 at the handoff — which lets callers express
 * overshoot in honest pixels rather than in tuning-constant soup, and
 * guarantees the cursor lands precisely on target at t=1.
 */
export function overshootEnvelope(t: number): number {
  const c = clamp01(t)
  const handoff = 1 - SETTLE_FRACTION
  if (c <= handoff) {
    return minimumJerk((c - OVERSHOOT_RAMP_START) / (handoff - OVERSHOOT_RAMP_START))
  }
  return 1 - minimumJerk((c - handoff) / SETTLE_FRACTION)
}

/* -------------------------------------------------------------------------- */
/* Paths                                                                       */
/* -------------------------------------------------------------------------- */

export type Path = {
  p0: Point
  c1: Point
  c2: Point
  p3: Point
  /** Unit vector of the approach direction, for the overshoot to follow. */
  approach: Point
  distance: number
}

export function distanceBetween(a: Point, b: Point): number {
  return Math.hypot(b.x - a.x, b.y - a.y)
}

/**
 * Build a cubic bezier from `from` to `to` whose control points are pushed
 * perpendicular to the straight line between them. The bow direction and
 * magnitude are randomised within the personality's bounds, so no two journeys
 * between the same two points are identical — which is the tell that separates
 * this from a tween.
 */
export function buildPath(from: Point, to: Point, traits: Traits, rng: () => number): Path {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const distance = Math.hypot(dx, dy)

  if (distance < 0.5) {
    return {
      p0: { ...from },
      c1: { ...from },
      c2: { ...to },
      p3: { ...to },
      approach: { x: 0, y: 0 },
      distance: 0,
    }
  }

  // Perpendicular unit vector.
  const nx = -dy / distance
  const ny = dx / distance

  // Bow scales with distance but is capped: a long drag across a 4K monitor
  // should not sail through the dock.
  const jitter = 1 + (rng() * 2 - 1) * traits.curvatureJitter
  const sign = rng() < 0.5 ? -1 : 1
  const bow = Math.min(distance * traits.curvature * jitter, 160) * sign

  // Control points sit at roughly a third and two thirds along, each with its
  // own share of the bow, so the arc is asymmetric like a real one.
  const t1 = between(rng, 0.2, 0.38)
  const t2 = between(rng, 0.62, 0.82)
  const b1 = bow * between(rng, 0.7, 1.1)
  const b2 = bow * between(rng, 0.55, 1.0)

  const c1 = { x: from.x + dx * t1 + nx * b1, y: from.y + dy * t1 + ny * b1 }
  const c2 = { x: from.x + dx * t2 + nx * b2, y: from.y + dy * t2 + ny * b2 }

  // Approach direction is the tangent at the end of the curve — the overshoot
  // carries on the way the cursor was already going, not along the chord.
  const ax = to.x - c2.x
  const ay = to.y - c2.y
  const alen = Math.hypot(ax, ay) || 1

  return {
    p0: { ...from },
    c1,
    c2,
    p3: { ...to },
    approach: { x: ax / alen, y: ay / alen },
    distance,
  }
}

export function bezierAt(path: Path, t: number): Point {
  const u = 1 - t
  const a = u * u * u
  const b = 3 * u * u * t
  const c = 3 * u * t * t
  const d = t * t * t
  return {
    x: a * path.p0.x + b * path.c1.x + c * path.c2.x + d * path.p3.x,
    y: a * path.p0.y + b * path.c1.y + c * path.c2.y + d * path.p3.y,
  }
}

/**
 * Travel time as a function of distance — Fitts-ish, in that it grows
 * sub-linearly, so a flick across the screen is not ten times the duration of
 * a nudge. Clamped hard at both ends: below the floor it reads as a jump cut,
 * above the ceiling the viewer gets bored.
 */
export function travelDuration(distance: number, traits: Traits): number {
  return clamp(160 + Math.sqrt(distance) * 24 * traits.pace, 220, 1500)
}

/**
 * Deterministic sub-pixel tremor. Two incommensurable sine frequencies per
 * axis, so it never visibly repeats, and it is a pure function of time — which
 * means the SVG export reproduces it exactly rather than approximating it.
 */
export function tremorAt(t: number, amplitude: number, phase: number): Point {
  return {
    x: (Math.sin(t * 11.7 + phase) * 0.6 + Math.sin(t * 27.3 + phase * 1.7) * 0.4) * amplitude,
    y: (Math.sin(t * 13.1 + phase * 2.3) * 0.6 + Math.sin(t * 31.9 + phase) * 0.4) * amplitude,
  }
}

/**
 * The whole motion, as one pure function of normalised time.
 *
 * position = bezier(minimumJerk(travel))     the curved path, human velocity
 *          + approach · overshoot            past the target, then back
 *          + tremor                          the hand that is never quite still
 *
 * The travel ease completes early (see SETTLE_FRACTION) and the overshoot
 * envelope carries the rest. Because that envelope is zero at t=1 and the
 * tremor fades out over the final stretch, sampling at t=1 always returns the
 * exact target — no drift, no accumulated error over a long performance.
 */
export function sampleMotion(path: Path, t: number, traits: Traits, phase: number): Point {
  const c = clamp01(t)
  const travel = clamp01(c / (1 - SETTLE_FRACTION))
  const base = bezierAt(path, minimumJerk(travel))

  const overshootPx = Math.min(path.distance * traits.overshoot, traits.overshootMax)
  const env = overshootEnvelope(c) * overshootPx

  // Fade the tremor out as the cursor settles, so it lands clean.
  const tremorFade = 1 - clamp01((c - 0.85) / 0.15)
  const tr = tremorAt(c * 10, traits.tremor * tremorFade, phase)

  return {
    x: base.x + path.approach.x * env + tr.x,
    y: base.y + path.approach.y * env + tr.y,
  }
}

/**
 * Idle wander for `pause()`. Lissajous-ish drift around the resting point —
 * enough to look alive, never enough to look like it is going somewhere.
 */
export function driftAt(elapsed: number, traits: Traits, phase: number): Point {
  const t = (elapsed / 1000) * traits.driftRate
  return {
    x: (Math.sin(t * 1.3 + phase) + Math.sin(t * 0.7 + phase * 2)) * 0.5 * traits.drift,
    y: (Math.cos(t * 1.1 + phase * 1.5) + Math.sin(t * 0.53 + phase)) * 0.5 * traits.drift,
  }
}

/**
 * Per-keystroke delay. Humans are not metronomes: they burst through common
 * letters and rest fractionally after punctuation and spaces.
 */
export function keystrokeDelay(char: string, traits: Traits, rng: () => number): number {
  const [min, max] = traits.keystroke
  let d = between(rng, min, max)
  if (char === ' ') d *= 1.2
  if (/[.,!?;:]/.test(char)) d *= 2.4
  if (/[A-Z]/.test(char)) d *= 1.35
  return d
}
