/**
 * The actor: what actually performs.
 *
 * Framework-agnostic on purpose: it owns position, the action queue, and the
 * requestAnimationFrame loop, and knows nothing about React. <Stage> attaches
 * to it; it does not attach to <Stage>.
 *
 * Two rules run through everything here:
 *   1. Targets resolve at execution time, never at call time. By the time a
 *      queued click runs, the page has usually moved on.
 *   2. Events dispatched are real. The host app cannot tell the difference,
 *      which is the entire point of a staged performance over a video.
 */

import {
  buildPath,
  clamp01,
  createRng,
  distanceBetween,
  driftAt,
  keystrokeDelay,
  minimumJerk,
  sampleMotion,
  travelDuration,
  type Point,
  type Traits,
} from './motion'
import { emptyScript, isPoint, scalePoint, type Script, type Step } from './script'

export type Target = string | Element | { current: Element | null } | Point

export type ActorState = {
  visible: boolean
  pressed: boolean
  typing: boolean
  thinking: boolean
  caption: string | null
}

export type ActorOptions = {
  traits: Traits
  seed?: number
  /** Consulted per action, so a mid-performance OS toggle is honoured. */
  reducedMotion?: () => boolean
  onFrame?: (p: Point) => void
  onState?: (s: ActorState) => void
  onRipple?: (p: Point, kind: 'click' | 'dblclick') => void
  onScriptChange?: (s: Script) => void
}

const now = (): number =>
  typeof performance !== 'undefined' && performance.now ? performance.now() : Date.now()

const PRESS_MS = 90

export class Actor {
  position: Point
  private opts: ActorOptions
  private traits: Traits
  private rng: () => number
  private state: ActorState = {
    visible: true,
    pressed: false,
    typing: false,
    thinking: false,
    caption: null,
  }

  private chain: Promise<unknown> = Promise.resolve()
  private raf: number | null = null
  private timers = new Set<ReturnType<typeof setTimeout>>()
  private destroyed = false

  private script: Script
  private startedAt: number | null = null
  private recording = true

  constructor(opts: ActorOptions) {
    this.opts = opts
    this.traits = opts.traits
    const seed = opts.seed ?? Math.floor(Math.random() * 0xffffffff)
    this.rng = createRng(seed)
    const vw = typeof window === 'undefined' ? 0 : window.innerWidth
    const vh = typeof window === 'undefined' ? 0 : window.innerHeight
    // Resting position: left of centre, below the fold of the eye. Somewhere a
    // hand would plausibly have left it.
    this.position = { x: vw * 0.22, y: vh * 0.68 }
    this.script = emptyScript(seed, { w: vw, h: vh }, { ...this.position })
  }

  setTraits(traits: Traits): void {
    this.traits = traits
  }

  /**
   * Lets React re-point the callbacks after construction. The actor outlives
   * any single render; its handlers do not.
   */
  setHandlers(
    h: Partial<Pick<ActorOptions, 'onFrame' | 'onState' | 'onRipple' | 'onScriptChange'>>,
  ): void {
    Object.assign(this.opts, h)
  }

  getState(): ActorState {
    return this.state
  }

  /* ---------------------------------------------------------------------- */
  /* Plumbing                                                                */
  /* ---------------------------------------------------------------------- */

  private isReduced(): boolean {
    return this.opts.reducedMotion ? this.opts.reducedMotion() : false
  }

  private patch(next: Partial<ActorState>): void {
    this.state = { ...this.state, ...next }
    this.opts.onState?.(this.state)
  }

  private emitFrame(): void {
    this.opts.onFrame?.(this.position)
  }

  /** Chains onto the queue. A thrown action must not poison what follows. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.chain.then(
      () => (this.destroyed ? (undefined as T) : fn()),
      () => (this.destroyed ? (undefined as T) : fn()),
    )
    this.chain = run.then(
      () => undefined,
      () => undefined,
    )
    return run
  }

  private delay(ms: number): Promise<void> {
    if (this.destroyed || ms <= 0) return Promise.resolve()
    return new Promise((resolve) => {
      const id = setTimeout(() => {
        this.timers.delete(id)
        resolve()
      }, ms)
      this.timers.add(id)
    })
  }

  /**
   * Drives one animation. Under reduced motion this collapses to a single
   * tick at t=1: a jump cut, which is exactly what the setting asks for.
   */
  private animate(duration: number, onTick: (t: number) => void): Promise<void> {
    if (this.destroyed) return Promise.resolve()
    if (duration <= 0 || this.isReduced()) {
      onTick(1)
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const start = now()
      const tick = (): void => {
        if (this.destroyed) return resolve()
        const t = clamp01((now() - start) / duration)
        onTick(t)
        if (t >= 1) {
          this.raf = null
          resolve()
        } else {
          this.raf = requestAnimationFrame(tick)
        }
      }
      this.raf = requestAnimationFrame(tick)
    })
  }

  private record(step: Omit<Step, 'at'> & { at?: number }): void {
    if (!this.recording) return
    const t = now()
    if (this.startedAt === null) this.startedAt = t
    this.script.steps.push({
      ...step,
      point: step.point ?? pointOf(this.position),
      at: step.at ?? Math.round(t - this.startedAt),
    })
    this.opts.onScriptChange?.(this.getScript())
  }

  /* ---------------------------------------------------------------------- */
  /* Target resolution                                                       */
  /* ---------------------------------------------------------------------- */

  private resolve(target: Target): { point: Point; el: Element | null; record: string | Point } {
    if (typeof target === 'string') {
      const el = document.querySelector(target)
      if (!el) {
        console.warn(`matinee: no element matches ${JSON.stringify(target)}; staying put`)
        return { point: this.position, el: null, record: target }
      }
      return { point: this.pointIn(el), el, record: target }
    }

    if (target && typeof target === 'object' && 'current' in target) {
      const el = (target as { current: Element | null }).current
      if (!el) {
        console.warn('matinee: ref has no current element; staying put')
        return { point: this.position, el: null, record: { ...this.position } }
      }
      return { point: this.pointIn(el), el, record: pointOf(this.pointIn(el)) }
    }

    if (isDomElement(target)) {
      const p = this.pointIn(target)
      return { point: p, el: target, record: pointOf(p) }
    }

    const p = target as Point
    return { point: { x: p.x, y: p.y }, el: null, record: pointOf(p) }
  }

  /**
   * Where inside an element a hand would actually land: near the middle, but
   * never dead centre twice running.
   */
  private pointIn(el: Element): Point {
    const r = el.getBoundingClientRect()
    const jx = (this.rng() - 0.5) * r.width * 0.34
    const jy = (this.rng() - 0.5) * r.height * 0.34
    return { x: r.left + r.width / 2 + jx, y: r.top + r.height / 2 + jy }
  }

  private elementAtCursor(): Element | null {
    // Not every DOM implementation has this (happy-dom, older jsdom), and a
    // click with no explicit target is a legitimate thing to do.
    if (typeof document.elementFromPoint !== 'function') return null
    return document.elementFromPoint(this.position.x, this.position.y)
  }

  /* ---------------------------------------------------------------------- */
  /* Actions                                                                 */
  /* ---------------------------------------------------------------------- */

  moveTo(target: Target): Promise<void> {
    return this.enqueue(async () => {
      const { point, record } = this.resolve(target)
      const started = now()
      await this.travel(point)
      this.record({
        action: 'move',
        target: record,
        duration: Math.round(now() - started),
      })
    })
  }

  /** The shared movement primitive. Not queued; callers are already queued. */
  private async travel(to: Point): Promise<void> {
    const dist = distanceBetween(this.position, to)
    if (dist < 0.5) return
    const path = buildPath(this.position, to, this.traits, this.rng)
    const duration = travelDuration(dist, this.traits)
    const phase = this.rng() * 100
    await this.animate(duration, (t) => {
      this.position = sampleMotion(path, t, this.traits, phase)
      this.emitFrame()
    })
    this.position = { ...to }
    this.emitFrame()
  }

  click(target?: Target): Promise<void> {
    return this.enqueue(() => this.performClick(target, 'click'))
  }

  dblclick(target?: Target): Promise<void> {
    return this.enqueue(() => this.performClick(target, 'dblclick'))
  }

  private async performClick(target: Target | undefined, kind: 'click' | 'dblclick'): Promise<void> {
    const started = now()
    let el: Element | null = null
    let record: string | Point = pointOf(this.position)

    if (target !== undefined) {
      const r = this.resolve(target)
      el = r.el
      record = r.record
      await this.travel(r.point)
    }
    if (!el) el = this.elementAtCursor()

    // The beat before committing. Removing this line makes the whole thing
    // read as a machine again.
    await this.delay(this.isReduced() ? 0 : this.traits.hesitation)

    const rounds = kind === 'dblclick' ? 2 : 1
    for (let i = 0; i < rounds; i++) {
      this.patch({ pressed: true })
      this.opts.onRipple?.({ ...this.position }, kind)
      this.fire(el, 'pointerdown')
      this.fire(el, 'mousedown')
      await this.delay(this.isReduced() ? 0 : PRESS_MS)
      this.patch({ pressed: false })
      this.fire(el, 'pointerup')
      this.fire(el, 'mouseup')
      this.fire(el, 'click', { detail: i + 1 })
      if (i === 0 && rounds === 2) await this.delay(this.isReduced() ? 0 : 70)
    }
    if (kind === 'dblclick') this.fire(el, 'dblclick', { detail: 2 })

    this.record({ action: kind, target: record, duration: Math.round(now() - started) })
  }

  hover(target: Target, ms = 600): Promise<void> {
    return this.enqueue(async () => {
      const started = now()
      const { point, el, record } = this.resolve(target)
      await this.travel(point)
      this.fire(el, 'pointerover')
      this.fire(el, 'mouseover')
      this.fire(el, 'mousemove')
      await this.idle(ms)
      this.record({ action: 'hover', target: record, duration: Math.round(now() - started) })
    })
  }

  type(target: Target, text: string): Promise<void> {
    return this.enqueue(async () => {
      const started = now()
      const { point, el, record } = this.resolve(target)
      await this.travel(point)
      await this.delay(this.isReduced() ? 0 : this.traits.hesitation)

      this.patch({ pressed: true })
      this.opts.onRipple?.({ ...this.position }, 'click')
      this.fire(el, 'pointerdown')
      this.fire(el, 'mousedown')
      await this.delay(this.isReduced() ? 0 : PRESS_MS)
      this.patch({ pressed: false })
      this.fire(el, 'pointerup')
      this.fire(el, 'mouseup')
      this.fire(el, 'click')

      const field = el as HTMLElement | null
      field?.focus?.()
      this.patch({ typing: true })

      if (this.isReduced()) {
        setFieldValue(field, currentValue(field) + text)
      } else {
        for (const char of text) {
          if (this.destroyed) break
          this.fire(field, 'keydown', { key: char })
          setFieldValue(field, currentValue(field) + char)
          this.fire(field, 'keyup', { key: char })
          await this.delay(keystrokeDelay(char, this.traits, this.rng))
        }
      }

      this.patch({ typing: false })
      this.record({
        action: 'type',
        target: record,
        text,
        duration: Math.round(now() - started),
      })
    })
  }

  scrollTo(target: Target): Promise<void> {
    return this.enqueue(async () => {
      const started = now()
      const { el, record } = this.resolve(target)
      if (el) await this.performScroll(el)
      this.record({ action: 'scroll', target: record, duration: Math.round(now() - started) })
    })
  }

  /**
   * Smooth-scrolls the nearest scrollable ancestor. Hand-driven rather than
   * `scrollIntoView({behavior:'smooth'})` because we need to await completion,
   * and because the browser's curve is not the one the rest of this uses.
   */
  private async performScroll(el: Element): Promise<void> {
    const scroller = nearestScroller(el)
    const rect = el.getBoundingClientRect()

    let fromY: number
    let toY: number
    if (scroller === document.scrollingElement || scroller === document.documentElement) {
      fromY = window.scrollY
      // Park the target a third of the way down, where the eye expects it,
      // not jammed against the top edge.
      toY = Math.max(0, fromY + rect.top - window.innerHeight * 0.34)
    } else {
      const sRect = (scroller as Element).getBoundingClientRect()
      fromY = (scroller as Element).scrollTop
      toY = Math.max(0, fromY + rect.top - sRect.top - sRect.height * 0.34)
    }

    const delta = toY - fromY
    if (Math.abs(delta) < 1) return

    const duration = Math.min(220 + Math.sqrt(Math.abs(delta)) * 26 * this.traits.pace, 1400)
    const cursorFrom = { ...this.position }

    await this.animate(duration, (t) => {
      const e = minimumJerk(t)
      const y = fromY + delta * e
      if (scroller === document.scrollingElement || scroller === document.documentElement) {
        window.scrollTo(0, y)
      } else {
        ;(scroller as Element).scrollTop = y
      }
      // The cursor loiters while the page moves under it: a few px of counter
      // drift, as though resting on a trackpad mid-swipe.
      this.position = {
        x: cursorFrom.x + Math.sin(t * Math.PI) * 6,
        y: cursorFrom.y + Math.sin(t * Math.PI) * (delta > 0 ? 14 : -14),
      }
      this.emitFrame()
    })
    this.position = cursorFrom
    this.emitFrame()
  }

  pause(ms = 800): Promise<void> {
    return this.enqueue(async () => {
      const started = now()
      this.patch({ thinking: true })
      await this.idle(ms)
      this.patch({ thinking: false })
      this.record({ action: 'pause', duration: Math.round(now() - started) })
    })
  }

  /** Holds position with a live idle wander rather than freezing solid. */
  private async idle(ms: number): Promise<void> {
    if (this.isReduced()) return this.delay(ms)
    const anchor = { ...this.position }
    const phase = this.rng() * 100
    await this.animate(ms, (t) => {
      const d = driftAt(t * ms, this.traits, phase)
      this.position = { x: anchor.x + d.x, y: anchor.y + d.y }
      this.emitFrame()
    })
    this.position = anchor
    this.emitFrame()
  }

  say(text: string, ms?: number): Promise<void> {
    return this.enqueue(async () => {
      const started = now()
      // Long enough to read it: roughly 45ms a character, floored at 1.2s.
      const hold = ms ?? Math.max(1200, text.length * 45)
      this.patch({ caption: text })
      await this.idle(hold)
      this.patch({ caption: null })
      this.record({ action: 'say', text, duration: Math.round(now() - started) })
    })
  }

  show(): Promise<void> {
    return this.enqueue(async () => {
      this.patch({ visible: true })
      this.record({ action: 'show', duration: 0 })
      await this.delay(this.isReduced() ? 0 : 260)
    })
  }

  hide(): Promise<void> {
    return this.enqueue(async () => {
      this.patch({ visible: false })
      this.record({ action: 'hide', duration: 0 })
      await this.delay(this.isReduced() ? 0 : 260)
    })
  }

  /* ---------------------------------------------------------------------- */
  /* Scripts                                                                 */
  /* ---------------------------------------------------------------------- */

  getScript(): Script {
    return {
      version: 1,
      viewport: { ...this.script.viewport },
      seed: this.script.seed,
      origin: { ...this.script.origin },
      steps: this.script.steps.map((s) => ({ ...s })),
    }
  }

  clearScript(): void {
    this.script = emptyScript(this.script.seed, this.script.viewport, { ...this.position })
    this.startedAt = null
    this.opts.onScriptChange?.(this.getScript())
  }

  /**
   * Replays a script, gaps and all. Reproducing the original rhythm matters as
   * much as reproducing the positions; the pauses are where it reads as
   * deliberate rather than mechanical.
   */
  play(script: Script): Promise<void> {
    return this.enqueue(async () => {
      const wasRecording = this.recording
      this.recording = false
      const to = { w: window.innerWidth, h: window.innerHeight }
      let cursorTime = 0

      try {
        for (const step of script.steps) {
          if (this.destroyed) break
          const gap = step.at - cursorTime
          if (gap > 16) await this.delay(gap)

          const target: Target | undefined =
            step.target === undefined
              ? undefined
              : isPoint(step.target)
                ? scalePoint(step.target, script.viewport, to)
                : step.target

          await this.runStep(step, target)
          cursorTime = step.at + step.duration
        }
      } finally {
        this.recording = wasRecording
      }
    })
  }

  /** Steps are performed inline: `play` is itself one queue entry. */
  private async runStep(step: Step, target: Target | undefined): Promise<void> {
    switch (step.action) {
      case 'move':
        if (target !== undefined) {
          const r = this.resolve(target)
          await this.travel(r.point)
        }
        return
      case 'click':
      case 'dblclick':
        return this.performClick(target, step.action)
      case 'type':
        if (target !== undefined && step.text !== undefined) {
          // `type` queues, and we are already inside the queue, so inline the
          // work instead of deadlocking on our own chain.
          const r = this.resolve(target)
          await this.travel(r.point)
          const field = r.el as HTMLElement | null
          field?.focus?.()
          this.patch({ typing: true })
          if (this.isReduced()) {
            setFieldValue(field, currentValue(field) + step.text)
          } else {
            for (const char of step.text) {
              if (this.destroyed) break
              setFieldValue(field, currentValue(field) + char)
              await this.delay(keystrokeDelay(char, this.traits, this.rng))
            }
          }
          this.patch({ typing: false })
        }
        return
      case 'scroll':
        if (target !== undefined) {
          const r = this.resolve(target)
          if (r.el) await this.performScroll(r.el)
        }
        return
      case 'hover':
        if (target !== undefined) {
          const r = this.resolve(target)
          await this.travel(r.point)
          await this.idle(step.duration)
        }
        return
      case 'pause':
        this.patch({ thinking: true })
        await this.idle(step.duration)
        this.patch({ thinking: false })
        return
      case 'say':
        this.patch({ caption: step.text ?? null })
        await this.idle(step.duration)
        this.patch({ caption: null })
        return
      case 'show':
        this.patch({ visible: true })
        return
      case 'hide':
        this.patch({ visible: false })
        return
    }
  }

  /* ---------------------------------------------------------------------- */
  /* Events                                                                  */
  /* ---------------------------------------------------------------------- */

  /**
   * Real events, on the real target. `click` here makes a React onClick fire
   * exactly as a hand would, which is why a matinee performance drives the
   * host app rather than drawing over it.
   */
  private fire(el: Element | null, type: string, init: MouseEventInit & { key?: string } = {}): void {
    if (!el) return
    const base: MouseEventInit = {
      bubbles: true,
      cancelable: true,
      composed: true,
      clientX: this.position.x,
      clientY: this.position.y,
      view: window,
      ...init,
    }

    if (type.startsWith('key')) {
      el.dispatchEvent(
        new KeyboardEvent(type, { bubbles: true, cancelable: true, key: init.key ?? '' }),
      )
      return
    }

    if (type.startsWith('pointer') && typeof PointerEvent === 'function') {
      el.dispatchEvent(
        new PointerEvent(type, { ...base, pointerId: 1, pointerType: 'mouse', isPrimary: true }),
      )
      return
    }

    el.dispatchEvent(new MouseEvent(type, base))
  }

  destroy(): void {
    this.destroyed = true
    if (this.raf !== null) cancelAnimationFrame(this.raf)
    this.raf = null
    for (const id of this.timers) clearTimeout(id)
    this.timers.clear()
  }
}

/* -------------------------------------------------------------------------- */
/* Field helpers                                                               */
/* -------------------------------------------------------------------------- */

function isDomElement(v: unknown): v is Element {
  return typeof Element !== 'undefined' && v instanceof Element
}

function pointOf(p: Point): Point {
  return { x: Math.round(p.x), y: Math.round(p.y) }
}

function currentValue(el: HTMLElement | null): string {
  if (!el) return ''
  if (isField(el)) return el.value
  if (el.isContentEditable) return el.textContent ?? ''
  return ''
}

function isField(el: HTMLElement): el is HTMLInputElement | HTMLTextAreaElement {
  return typeof HTMLInputElement !== 'undefined'
    ? el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement
    : false
}

/**
 * React installs its own value setter on the input instance and tracks the
 * last value it wrote. Assigning `el.value = x` directly updates the DOM but
 * leaves React's tracker in sync with the *old* value, so the synthetic input
 * event never fires and controlled components silently ignore the typing.
 * Going through the prototype setter is what makes React notice.
 */
function setFieldValue(el: HTMLElement | null, value: string): void {
  if (!el) return

  if (isField(el)) {
    const proto =
      typeof HTMLTextAreaElement !== 'undefined' && el instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype
    const setter = Object.getOwnPropertyDescriptor(proto, 'value')?.set
    if (setter) setter.call(el, value)
    else el.value = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
    return
  }

  if (el.isContentEditable) {
    el.textContent = value
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }
}

function nearestScroller(el: Element): Element {
  let node: Element | null = el.parentElement
  while (node) {
    const style = getComputedStyle(node)
    const overflow = style.overflowY
    if ((overflow === 'auto' || overflow === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }
  return document.scrollingElement ?? document.documentElement
}
