/**
 * <Stage>: the two lines of integration.
 *
 * It renders its children completely untouched and mounts one fixed,
 * pointer-events:none, aria-hidden overlay beside them. It must never affect
 * layout, never intercept a click, and never appear to a screen reader.
 */

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { Actor, type Target } from './actor'
import { CursorLayer, type CursorGlyph } from './cursor'
import { scriptToPathPng, type PngOptions } from './export-png'
import { scriptToSvg, type SvgOptions } from './export-svg'
import { traitsFor, type PersonalityName, type Point } from './motion'
import type { Script } from './script'

export type Cursor = {
  moveTo(target: Target): Promise<void>
  click(target?: Target): Promise<void>
  dblclick(target?: Target): Promise<void>
  type(target: Target, text: string): Promise<void>
  scrollTo(target: Target): Promise<void>
  hover(target: Target, ms?: number): Promise<void>
  pause(ms?: number): Promise<void>
  say(text: string, ms?: number): Promise<void>
  show(): Promise<void>
  hide(): Promise<void>
  /** The performance so far, as plain data. */
  getScript(): Script
  clearScript(): void
  play(script: Script): Promise<void>
  /** Self-contained animated SVG of the recorded performance. */
  toSvg(options?: SvgOptions): string
  /** Static PNG of the path with click markers, on transparency. */
  toPathPng(options?: PngOptions): Promise<Blob>
  readonly position: Point
}

export type StageProps = {
  children?: ReactNode
  /** Nameplate riding with the cursor. `false` removes it. */
  label?: string | false
  color?: string
  cursor?: CursorGlyph
  personality?: PersonalityName
  /** `true` for the default length, or a number of dots. */
  trail?: boolean | number
  scale?: number
  zIndex?: number
  respectReducedMotion?: boolean
  onScriptChange?: (script: Script) => void
}

/** A blue that is confident without being a link. */
const DEFAULT_COLOR = '#2f6bff'

const StageContext = createContext<Cursor | null>(null)

export function Stage({
  children,
  label = 'Agent',
  color = DEFAULT_COLOR,
  cursor = 'pointer',
  personality = 'confident',
  trail = false,
  scale = 1,
  zIndex = 9999,
  respectReducedMotion = true,
  onScriptChange,
}: StageProps): ReactNode {
  const traits = useMemo(() => traitsFor(personality), [personality])

  // Read through a ref so a mid-performance OS toggle takes effect, and so
  // flipping the prop does not tear down the actor.
  const reducedRef = useRef(false)
  const respectRef = useRef(respectReducedMotion)
  respectRef.current = respectReducedMotion

  // The actor is created during render rather than in an effect: a child's
  // effect runs *before* its parent's, so an app that starts performing on
  // mount would otherwise find no actor there.
  const actorRef = useRef<Actor | null>(null)
  if (actorRef.current === null && typeof window !== 'undefined') {
    actorRef.current = new Actor({
      traits,
      reducedMotion: () => respectRef.current && reducedRef.current,
    })
  }
  const actor = actorRef.current

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
    return () => actorRef.current?.destroy()
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    reducedRef.current = mq.matches
    const onChange = (e: MediaQueryListEvent): void => {
      reducedRef.current = e.matches
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    actor?.setTraits(traits)
  }, [actor, traits])

  useEffect(() => {
    actor?.setHandlers({ onScriptChange })
  }, [actor, onScriptChange])

  const value = useMemo<Cursor>(() => makeCursor(actor, traits, color), [actor, traits, color])

  return (
    <StageContext.Provider value={value}>
      {children}
      {mounted && actor && (
        <CursorLayer
          actor={actor}
          label={label}
          color={color}
          glyph={cursor}
          trail={trail}
          scale={scale}
          zIndex={zIndex}
        />
      )}
    </StageContext.Provider>
  )
}

export function useCursor(): Cursor {
  const ctx = useContext(StageContext)
  if (!ctx) {
    throw new Error('matinee: useCursor() must be called inside a <Stage>')
  }
  return ctx
}

/**
 * Wraps the actor in the public surface. On the server (and before mount)
 * every method is a resolved no-op, so an app that performs on load renders
 * identically in Node and never throws during SSR.
 */
function makeCursor(
  actor: Actor | null,
  traits: ReturnType<typeof traitsFor>,
  color: string,
): Cursor {
  const noop = (): Promise<void> => Promise.resolve()
  const emptyScript = (): Script => ({
    version: 1,
    viewport: { w: 0, h: 0 },
    seed: 1,
    origin: { x: 0, y: 0 },
    steps: [],
  })

  if (!actor) {
    return {
      moveTo: noop,
      click: noop,
      dblclick: noop,
      type: noop,
      scrollTo: noop,
      hover: noop,
      pause: noop,
      say: noop,
      show: noop,
      hide: noop,
      getScript: emptyScript,
      clearScript: () => {},
      play: noop,
      toSvg: () => '',
      toPathPng: () => Promise.resolve(new Blob()),
      get position() {
        return { x: 0, y: 0 }
      },
    }
  }

  return {
    moveTo: (t) => actor.moveTo(t),
    click: (t) => actor.click(t),
    dblclick: (t) => actor.dblclick(t),
    type: (t, text) => actor.type(t, text),
    scrollTo: (t) => actor.scrollTo(t),
    hover: (t, ms) => actor.hover(t, ms),
    pause: (ms) => actor.pause(ms),
    say: (text, ms) => actor.say(text, ms),
    show: () => actor.show(),
    hide: () => actor.hide(),
    getScript: () => actor.getScript(),
    clearScript: () => actor.clearScript(),
    play: (s) => actor.play(s),
    toSvg: (options) => scriptToSvg(actor.getScript(), { traits, color, ...options }),
    toPathPng: (options) => scriptToPathPng(actor.getScript(), { traits, color, ...options }),
    get position() {
      return { ...actor.position }
    },
  }
}
