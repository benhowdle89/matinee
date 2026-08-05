import { describe, expect, it } from 'vitest'
import {
  bezierAt,
  buildPath,
  createRng,
  driftAt,
  keystrokeDelay,
  minimumJerk,
  overshootEnvelope,
  PERSONALITIES,
  sampleMotion,
  travelDuration,
  type Point,
} from '../src/motion'

const A: Point = { x: 100, y: 100 }
const B: Point = { x: 700, y: 420 }

describe('minimumJerk', () => {
  it('pins both ends', () => {
    expect(minimumJerk(0)).toBe(0)
    expect(minimumJerk(1)).toBe(1)
  })

  it('clamps outside 0..1 rather than extrapolating', () => {
    expect(minimumJerk(-3)).toBe(0)
    expect(minimumJerk(4)).toBe(1)
  })

  it('starts and ends slowly, and is fastest in the middle', () => {
    const d = (t: number) => minimumJerk(t + 0.01) - minimumJerk(t - 0.01)
    expect(d(0.5)).toBeGreaterThan(d(0.1))
    expect(d(0.5)).toBeGreaterThan(d(0.9))
  })

  it('is symmetric about the midpoint', () => {
    expect(minimumJerk(0.5)).toBeCloseTo(0.5, 10)
    expect(minimumJerk(0.3) + minimumJerk(0.7)).toBeCloseTo(1, 10)
  })
})

describe('overshootEnvelope', () => {
  it('is zero while the cursor is still travelling', () => {
    expect(overshootEnvelope(0)).toBe(0)
    expect(overshootEnvelope(0.4)).toBe(0)
    expect(overshootEnvelope(0.55)).toBe(0)
  })

  it('peaks at 1, so overshoot can be expressed in honest pixels', () => {
    let peak = 0
    for (let t = 0; t <= 1; t += 0.001) peak = Math.max(peak, overshootEnvelope(t))
    expect(peak).toBeGreaterThan(0.99)
    expect(peak).toBeLessThan(1.01)
  })

  it('has settled by the end so the cursor lands on target', () => {
    expect(Math.abs(overshootEnvelope(1))).toBeLessThan(0.05)
  })
})

describe('createRng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(12345)
    const b = createRng(12345)
    expect([a(), a(), a()]).toEqual([b(), b(), b()])
  })

  it('differs across seeds', () => {
    expect(createRng(1)()).not.toBe(createRng(2)())
  })

  it('stays inside [0, 1)', () => {
    const rng = createRng(7)
    for (let i = 0; i < 2000; i++) {
      const v = rng()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('buildPath', () => {
  it('starts and ends where it was told to', () => {
    const p = buildPath(A, B, PERSONALITIES.confident, createRng(1))
    expect(bezierAt(p, 0)).toEqual(A)
    const end = bezierAt(p, 1)
    expect(end.x).toBeCloseTo(B.x, 6)
    expect(end.y).toBeCloseTo(B.y, 6)
  })

  it('bows away from the straight line', () => {
    const p = buildPath(A, B, PERSONALITIES.curious, createRng(3))
    const mid = bezierAt(p, 0.5)
    const chordMid = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }
    expect(Math.hypot(mid.x - chordMid.x, mid.y - chordMid.y)).toBeGreaterThan(2)
  })

  it('never traces the same curve twice', () => {
    const rng = createRng(9)
    const first = bezierAt(buildPath(A, B, PERSONALITIES.confident, rng), 0.5)
    const second = bezierAt(buildPath(A, B, PERSONALITIES.confident, rng), 0.5)
    expect(first).not.toEqual(second)
  })

  it('degenerates safely when start and end coincide', () => {
    const p = buildPath(A, { ...A }, PERSONALITIES.confident, createRng(1))
    expect(p.distance).toBe(0)
    expect(Number.isFinite(bezierAt(p, 0.5).x)).toBe(true)
  })

  it('caps the bow so long journeys stay on screen', () => {
    // Perpendicular deviation from the straight line, which is what the cap
    // governs; displacement *along* the chord is just progress.
    const perpendicularOffset = (from: Point, to: Point, at: Point): number => {
      const dx = to.x - from.x
      const dy = to.y - from.y
      const len = Math.hypot(dx, dy)
      return Math.abs((at.x - from.x) * (-dy / len) + (at.y - from.y) * (dx / len))
    }

    const far = { x: 20000, y: 20000 }
    for (let seed = 1; seed <= 40; seed++) {
      const p = buildPath(A, far, PERSONALITIES.curious, createRng(seed))
      for (let t = 0; t <= 1; t += 0.02) {
        expect(perpendicularOffset(A, far, bezierAt(p, t))).toBeLessThan(200)
      }
    }
  })
})

describe('travelDuration', () => {
  it('grows with distance', () => {
    const t = PERSONALITIES.confident
    expect(travelDuration(800, t)).toBeGreaterThan(travelDuration(80, t))
  })

  it('grows sub-linearly, so a long flick is not ten times a nudge', () => {
    const t = PERSONALITIES.confident
    expect(travelDuration(1000, t)).toBeLessThan(travelDuration(100, t) * 10)
  })

  it('clamps at both ends', () => {
    const t = PERSONALITIES.confident
    expect(travelDuration(0, t)).toBeGreaterThanOrEqual(220)
    expect(travelDuration(50000, t)).toBeLessThanOrEqual(1500)
  })

  it('honours personality pace', () => {
    expect(travelDuration(600, PERSONALITIES.caffeinated)).toBeLessThan(
      travelDuration(600, PERSONALITIES.curious),
    )
  })
})

describe('sampleMotion', () => {
  it('lands exactly on target at t=1', () => {
    for (const name of ['confident', 'curious', 'caffeinated'] as const) {
      const traits = PERSONALITIES[name]
      const path = buildPath(A, B, traits, createRng(11))
      const end = sampleMotion(path, 1, traits, 0.5)
      expect(end.x).toBeCloseTo(B.x, 4)
      expect(end.y).toBeCloseTo(B.y, 4)
    }
  })

  it('overshoots past the target before settling', () => {
    const traits = PERSONALITIES.caffeinated
    const path = buildPath(A, B, traits, createRng(5))
    const chord = Math.hypot(B.x - A.x, B.y - A.y)
    let maxFromStart = 0
    for (let t = 0; t <= 1; t += 0.005) {
      const p = sampleMotion(path, t, traits, 0.2)
      maxFromStart = Math.max(maxFromStart, Math.hypot(p.x - A.x, p.y - A.y))
    }
    expect(maxFromStart).toBeGreaterThan(chord)
  })

  it('produces finite values across the whole journey', () => {
    const traits = PERSONALITIES.curious
    const path = buildPath(A, B, traits, createRng(6))
    for (let t = -0.2; t <= 1.2; t += 0.01) {
      const p = sampleMotion(path, t, traits, 1.3)
      expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true)
    }
  })

  it('is a pure function of its inputs, so exports reproduce it', () => {
    const traits = PERSONALITIES.confident
    const path = buildPath(A, B, traits, createRng(8))
    expect(sampleMotion(path, 0.42, traits, 3)).toEqual(sampleMotion(path, 0.42, traits, 3))
  })
})

describe('driftAt', () => {
  it('stays within the personality radius', () => {
    const traits = PERSONALITIES.curious
    for (let t = 0; t < 8000; t += 25) {
      const d = driftAt(t, traits, 0.7)
      expect(Math.hypot(d.x, d.y)).toBeLessThanOrEqual(traits.drift * 1.5)
    }
  })
})

describe('keystrokeDelay', () => {
  it('rests longer after punctuation than after a plain letter', () => {
    const traits = PERSONALITIES.confident
    const avg = (char: string) => {
      const rng = createRng(4)
      let total = 0
      for (let i = 0; i < 400; i++) total += keystrokeDelay(char, traits, rng)
      return total / 400
    }
    expect(avg('.')).toBeGreaterThan(avg('a'))
    expect(avg(' ')).toBeGreaterThan(avg('a'))
  })

  it('varies keystroke to keystroke', () => {
    const rng = createRng(2)
    const traits = PERSONALITIES.confident
    const a = keystrokeDelay('a', traits, rng)
    const b = keystrokeDelay('a', traits, rng)
    expect(a).not.toBe(b)
  })
})
