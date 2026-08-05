import { beforeEach, describe, expect, it } from 'vitest'
import { Actor } from '../src/actor'
import { PERSONALITIES } from '../src/motion'
import { validateScript, type Script } from '../src/script'

function makeActor(overrides: Partial<ConstructorParameters<typeof Actor>[0]> = {}): Actor {
  return new Actor({ traits: PERSONALITIES.caffeinated, seed: 42, ...overrides })
}

/** Real elements, with real boxes — happy-dom returns zeros otherwise. */
function stageButton(id: string, box = { x: 300, y: 200, w: 120, h: 40 }): HTMLButtonElement {
  const el = document.createElement('button')
  el.id = id
  el.textContent = id
  document.body.appendChild(el)
  el.getBoundingClientRect = () =>
    ({
      x: box.x,
      y: box.y,
      left: box.x,
      top: box.y,
      right: box.x + box.w,
      bottom: box.y + box.h,
      width: box.w,
      height: box.h,
      toJSON: () => ({}),
    }) as DOMRect
  return el
}

describe('recording', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('records each action as plain, serialisable data', async () => {
    const actor = makeActor()
    stageButton('go')

    await actor.moveTo({ x: 400, y: 300 })
    await actor.click('#go')
    await actor.pause(30)

    const script = actor.getScript()
    expect(script.version).toBe(1)
    expect(script.steps.map((s) => s.action)).toEqual(['move', 'click', 'pause'])
    expect(() => JSON.parse(JSON.stringify(script))).not.toThrow()
    actor.destroy()
  })

  it('stores selectors for selector targets, and points otherwise', async () => {
    const actor = makeActor()
    stageButton('go')

    await actor.moveTo('#go')
    await actor.moveTo({ x: 120, y: 90 })

    const [bySelector, byPoint] = actor.getScript().steps
    expect(bySelector?.target).toBe('#go')
    expect(byPoint?.target).toEqual({ x: 120, y: 90 })
    actor.destroy()
  })

  it('timestamps steps in order, with non-negative durations', async () => {
    const actor = makeActor()
    await actor.moveTo({ x: 200, y: 200 })
    await actor.pause(40)
    await actor.moveTo({ x: 500, y: 400 })

    const steps = actor.getScript().steps
    for (let i = 1; i < steps.length; i++) {
      expect(steps[i]!.at).toBeGreaterThanOrEqual(steps[i - 1]!.at)
      expect(steps[i]!.duration).toBeGreaterThanOrEqual(0)
    }
    actor.destroy()
  })

  it('hands out copies, so callers cannot mutate the performance', async () => {
    const actor = makeActor()
    await actor.moveTo({ x: 300, y: 300 })

    const script = actor.getScript()
    script.steps.push({ action: 'click', at: 0, duration: 0 })
    script.steps[0]!.at = 99999

    expect(actor.getScript().steps).toHaveLength(1)
    expect(actor.getScript().steps[0]!.at).not.toBe(99999)
    actor.destroy()
  })

  it('notifies onScriptChange as the performance runs', async () => {
    const seen: number[] = []
    const actor = makeActor({ onScriptChange: (s) => seen.push(s.steps.length) })

    await actor.moveTo({ x: 200, y: 200 })
    await actor.moveTo({ x: 400, y: 400 })

    expect(seen).toEqual([1, 2])
    actor.destroy()
  })

  it('clears back to an empty script', async () => {
    const actor = makeActor()
    await actor.moveTo({ x: 200, y: 200 })
    actor.clearScript()
    expect(actor.getScript().steps).toEqual([])
    actor.destroy()
  })
})

describe('replay round-trip', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('replays a recorded script and lands in the same place', async () => {
    const actor = makeActor()
    await actor.moveTo({ x: 420, y: 260 })
    await actor.pause(20)
    const script = actor.getScript()
    const landed = { ...actor.position }
    actor.destroy()

    const understudy = makeActor()
    await understudy.play(script)

    expect(understudy.position.x).toBeCloseTo(landed.x, 0)
    expect(understudy.position.y).toBeCloseTo(landed.y, 0)
    understudy.destroy()
  })

  it('survives a JSON round-trip', async () => {
    const actor = makeActor()
    stageButton('go')
    await actor.click('#go')
    const script = actor.getScript()
    actor.destroy()

    const revived = validateScript(JSON.parse(JSON.stringify(script)))
    expect(revived.steps).toEqual(script.steps)

    const understudy = makeActor()
    stageButton('go')
    await expect(understudy.play(revived)).resolves.toBeUndefined()
    understudy.destroy()
  })

  it('does not record while replaying', async () => {
    const actor = makeActor()
    await actor.moveTo({ x: 300, y: 300 })
    const script = actor.getScript()
    const before = actor.getScript().steps.length

    await actor.play(script)
    expect(actor.getScript().steps).toHaveLength(before)
    actor.destroy()
  })

  it('rescales point targets recorded on a different viewport', async () => {
    const actor = makeActor()
    const script: Script = {
      version: 1,
      viewport: { w: 2000, h: 1000 },
      seed: 42,
      origin: { x: 0, y: 0 },
      steps: [{ action: 'move', target: { x: 1000, y: 500 }, at: 0, duration: 100 }],
    }

    await actor.play(script)

    // Half-way across a 2000px viewport should still be half-way across this one.
    expect(actor.position.x).toBeCloseTo(window.innerWidth / 2, 0)
    expect(actor.position.y).toBeCloseTo(window.innerHeight / 2, 0)
    actor.destroy()
  })

  it('rejects scripts from a future version', () => {
    expect(() => validateScript({ version: 2, steps: [] })).toThrow(/unsupported script version/)
    expect(() => validateScript(null)).toThrow(/must be an object/)
  })
})

describe('driving the host app', () => {
  beforeEach(() => {
    document.body.innerHTML = ''
  })

  it('dispatches real pointer and click events on the target', async () => {
    const actor = makeActor()
    const button = stageButton('go')
    const seen: string[] = []
    for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      button.addEventListener(type, () => seen.push(type))
    }

    await actor.click('#go')

    expect(seen).toEqual(['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'])
    actor.destroy()
  })

  it('fires click twice and dblclick once for a double click', async () => {
    const actor = makeActor()
    const button = stageButton('go')
    let clicks = 0
    let dbl = 0
    button.addEventListener('click', () => clicks++)
    button.addEventListener('dblclick', () => dbl++)

    await actor.dblclick('#go')

    expect(clicks).toBe(2)
    expect(dbl).toBe(1)
    actor.destroy()
  })

  it('types through the native setter so controlled inputs update', async () => {
    const actor = makeActor()
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.getBoundingClientRect = () =>
      ({ left: 100, top: 100, width: 200, height: 30, right: 300, bottom: 130 }) as DOMRect

    const values: string[] = []
    input.addEventListener('input', () => values.push(input.value))

    await actor.type(input, 'hi')

    expect(input.value).toBe('hi')
    expect(values).toEqual(['h', 'hi'])
    actor.destroy()
  })

  it('warns and stays put when a selector matches nothing', async () => {
    const actor = makeActor()
    const start = { ...actor.position }
    await actor.moveTo('#nope')
    expect(actor.position).toEqual(start)
    actor.destroy()
  })
})

describe('the queue', () => {
  it('runs actions in order even when they are not awaited', async () => {
    const actor = makeActor()
    const order: string[] = []

    const a = actor.moveTo({ x: 200, y: 200 }).then(() => order.push('a'))
    const b = actor.moveTo({ x: 400, y: 400 }).then(() => order.push('b'))
    const c = actor.moveTo({ x: 600, y: 200 }).then(() => order.push('c'))
    await Promise.all([a, b, c])

    expect(order).toEqual(['a', 'b', 'c'])
    expect(actor.position.x).toBeCloseTo(600, 0)
    actor.destroy()
  })

  it('stops cleanly on destroy without leaving timers behind', async () => {
    const actor = makeActor()
    const pending = actor.moveTo({ x: 900, y: 700 })
    actor.destroy()
    await expect(pending).resolves.toBeUndefined()
  })
})

describe('reduced motion', () => {
  it('jump-cuts instead of animating', async () => {
    const actor = makeActor({ reducedMotion: () => true })
    const started = Date.now()
    await actor.moveTo({ x: 900, y: 600 })
    expect(Date.now() - started).toBeLessThan(60)
    expect(actor.position).toEqual({ x: 900, y: 600 })
    actor.destroy()
  })

  it('still types the whole string, just instantly', async () => {
    const actor = makeActor({ reducedMotion: () => true })
    const input = document.createElement('input')
    document.body.appendChild(input)
    input.getBoundingClientRect = () =>
      ({ left: 10, top: 10, width: 100, height: 20, right: 110, bottom: 30 }) as DOMRect

    await actor.type(input, 'hello from matinee')
    expect(input.value).toBe('hello from matinee')
    actor.destroy()
  })
})
