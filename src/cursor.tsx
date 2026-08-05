/**
 * What the audience actually sees.
 *
 * Position is written straight to the DOM node from the actor's frame
 * callback — never through React state. Sixty setState calls a second would
 * make the motion the one thing in the library that stutters.
 *
 * The low-frequency things (pressed, typing, caption) do go through state,
 * because they change a handful of times a performance.
 */

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import type { Actor, ActorState } from './actor'
import type { Point } from './motion'

export type CursorGlyph = 'pointer' | 'hand' | ReactNode

export type CursorLayerProps = {
  actor: Actor
  label: string | false
  color: string
  glyph: CursorGlyph
  trail: boolean | number
  scale: number
  zIndex: number
}

type Ripple = { id: number; x: number; y: number }

const DEFAULT_TRAIL = 8
const MAX_TRAIL = 24
/** Frames between trail samples. Every frame gives a stub; this gives a tail. */
const TRAIL_STRIDE = 3

export function CursorLayer({
  actor,
  label,
  color,
  glyph,
  trail,
  scale,
  zIndex,
}: CursorLayerProps): ReactNode {
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const trailRefs = useRef<Array<HTMLDivElement | null>>([])
  const [state, setState] = useState<ActorState>(() => actor.getState())
  const [ripples, setRipples] = useState<Ripple[]>([])
  const rippleId = useRef(0)

  const trailLength =
    trail === true ? DEFAULT_TRAIL : typeof trail === 'number' ? clampInt(trail, 0, MAX_TRAIL) : 0

  // Ring buffer of recent positions, preallocated. The hot path allocates
  // nothing.
  const historyRef = useRef<Float32Array>(new Float32Array(0))
  const headRef = useRef(0)

  useLayoutEffect(() => {
    const size = Math.max(1, trailLength * TRAIL_STRIDE)
    historyRef.current = new Float32Array(size * 2)
    headRef.current = 0
  }, [trailLength])

  useLayoutEffect(() => {
    const writeFrame = (p: Point): void => {
      const node = cursorRef.current
      if (node) node.style.transform = `translate3d(${p.x}px, ${p.y}px, 0)`

      if (trailLength === 0) return
      const hist = historyRef.current
      const slots = hist.length / 2
      const head = (headRef.current + 1) % slots
      headRef.current = head
      hist[head * 2] = p.x
      hist[head * 2 + 1] = p.y

      for (let i = 0; i < trailLength; i++) {
        const dot = trailRefs.current[i]
        if (!dot) continue
        const idx = (head - (i + 1) * TRAIL_STRIDE + slots * 2) % slots
        dot.style.transform = `translate3d(${hist[idx * 2]}px, ${hist[idx * 2 + 1]}px, 0)`
      }
    }

    const addRipple = (p: Point): void => {
      const id = rippleId.current++
      setRipples((r) => [...r, { id, x: p.x, y: p.y }])
      setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 700)
    }

    actor.setHandlers({ onFrame: writeFrame, onState: setState, onRipple: addRipple })
    writeFrame(actor.position)
    setState(actor.getState())

    return () => actor.setHandlers({ onFrame: undefined, onState: undefined, onRipple: undefined })
  }, [actor, trailLength])

  // Seed the trail so it does not streak in from the origin on first move.
  useEffect(() => {
    const hist = historyRef.current
    for (let i = 0; i < hist.length; i += 2) {
      hist[i] = actor.position.x
      hist[i + 1] = actor.position.y
    }
  }, [actor, trailLength])

  const cursorClass = [
    'matinee-cursor',
    state.visible ? 'is-visible' : '',
    state.pressed ? 'is-pressed' : '',
    state.typing ? 'is-typing' : '',
    state.thinking ? 'is-thinking' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className="matinee-overlay"
      aria-hidden="true"
      style={
        {
          zIndex,
          '--matinee-color': color,
          '--matinee-scale': scale,
        } as React.CSSProperties
      }
    >
      {Array.from({ length: trailLength }, (_, i) => (
        <div
          key={i}
          ref={(el) => {
            trailRefs.current[i] = el
          }}
          className="matinee-trail-dot"
          style={{
            opacity: state.visible ? (1 - i / trailLength) * 0.32 : 0,
            transform: 'translate3d(-9999px, -9999px, 0)',
          }}
        />
      ))}

      {ripples.map((r) => (
        <span key={r.id} className="matinee-ripple" style={{ left: r.x, top: r.y }} />
      ))}

      <div ref={cursorRef} className={cursorClass}>
        <div className="matinee-cursor__glyph">
          <Glyph glyph={glyph} />
        </div>

        {label !== false && <div className="matinee-chip">{label}</div>}

        {state.caption !== null && <div className="matinee-caption">{state.caption}</div>}
      </div>
    </div>
  )
}

function Glyph({ glyph }: { glyph: CursorGlyph }): ReactNode {
  if (glyph === 'pointer') return <PointerGlyph />
  if (glyph === 'hand') return <HandGlyph />
  return <>{glyph}</>
}

/**
 * The macOS arrow. White fill with a dark outline so it stays legible over a
 * dark app, a light app, and a screenshot of somebody else's app.
 *
 * The tip sits at (5, 2.5) in this 24-unit box; styles.css offsets the glyph
 * by that fraction so the hot spot lands exactly on the actor's position.
 */
function PointerGlyph(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" className="matinee-glyph-svg">
      <path
        d="M5 2.5 L5 19.4 L9.2 15.3 L11.9 21.2 L14.6 20 L11.9 14.2 L17.6 14.2 Z"
        fill="#fff"
        stroke="rgba(17,17,20,0.92)"
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function HandGlyph(): ReactNode {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" className="matinee-glyph-svg">
      <path
        d="M9 2.6c0-.9.7-1.6 1.5-1.6S12 1.7 12 2.6v7.1h.6V4.4c0-.9.7-1.6 1.5-1.6s1.5.7 1.5 1.6v5.3h.6V6.1c0-.9.7-1.6 1.5-1.6s1.5.7 1.5 1.6v9.1c0 4.2-2.6 6.8-6.4 6.8-2.3 0-4.1-.9-5.3-2.8L3.2 14c-.5-.8-.2-1.8.6-2.2.7-.4 1.6-.2 2.1.5L7.4 14V5.1c0-.9.7-1.6 1.5-1.6"
        fill="#fff"
        stroke="rgba(17,17,20,0.92)"
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function clampInt(v: number, min: number, max: number): number {
  return Math.round(Math.max(min, Math.min(max, v)))
}
