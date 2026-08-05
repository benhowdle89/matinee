/**
 * <Stage> inside a real React tree.
 *
 * These render with react-dom/client rather than poking at the Actor
 * directly, because the things most likely to break in a consumer's app are
 * the seams: does it mount, does it leave the children alone, does it clean up.
 */

import { act, useEffect, useState, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Stage, useCursor, type Cursor } from '../src/index'

declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function render(ui: ReactNode): void {
  act(() => root.render(ui))
}

const overlay = (): HTMLElement | null => document.querySelector('.matinee-overlay')

/** Grabs the cursor handle out of the tree so a test can drive it. */
function Capture({ onReady }: { onReady: (c: Cursor) => void }): ReactNode {
  const cursor = useCursor()
  // Braces matter: returning the callback's value would hand React a
  // "cleanup function" that is actually an array index.
  useEffect(() => {
    onReady(cursor)
  }, [cursor, onReady])
  return null
}

describe('mounting', () => {
  it('renders children exactly as given', () => {
    render(
      <Stage>
        <main id="app">
          <h1>Untouched</h1>
        </main>
      </Stage>,
    )
    const app = container.querySelector('#app')
    expect(app).not.toBeNull()
    expect(app?.innerHTML).toBe('<h1>Untouched</h1>')
  })

  it('mounts exactly one overlay, hidden from assistive tech', () => {
    render(
      <Stage>
        <p>hello</p>
      </Stage>,
    )
    expect(document.querySelectorAll('.matinee-overlay')).toHaveLength(1)
    expect(overlay()?.getAttribute('aria-hidden')).toBe('true')
  })

  it('keeps the overlay inert and out of the layout', () => {
    // The stylesheet is the contract here, not computed style: no CSS is
    // loaded in the test environment, and these three declarations are the
    // difference between an overlay and a bug report.
    const css = readFileSync('src/styles.css', 'utf8')
    const block = /\.matinee-overlay\s*\{([^}]*)\}/.exec(css)?.[1] ?? ''
    expect(block).toMatch(/position:\s*fixed/)
    expect(block).toMatch(/pointer-events:\s*none/)
    expect(block).toMatch(/inset:\s*0/)
  })

  it('cleans up after itself on unmount', () => {
    render(
      <Stage>
        <p>hello</p>
      </Stage>,
    )
    expect(overlay()).not.toBeNull()
    act(() => root.unmount())
    expect(overlay()).toBeNull()
    // Re-created in afterEach's unmount call, which must not throw.
    root = createRoot(container)
  })

  it('refuses to hand out a cursor outside a Stage', () => {
    const Bare = (): ReactNode => {
      useCursor()
      return null
    }
    // React logs the thrown error; silence it so the run stays readable.
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Bare />)).toThrow(/must be called inside a <Stage>/)
    spy.mockRestore()
  })

  it('gives two Stages their own overlay and their own actor', () => {
    const handles: Cursor[] = []
    render(
      <>
        <Stage label="One">
          <Capture onReady={(c) => handles.push(c)} />
        </Stage>
        <Stage label="Two">
          <Capture onReady={(c) => handles.push(c)} />
        </Stage>
      </>,
    )
    expect(document.querySelectorAll('.matinee-overlay')).toHaveLength(2)
    expect(handles).toHaveLength(2)
    expect(handles[0]).not.toBe(handles[1])

    const labels = [...document.querySelectorAll('.matinee-chip')].map((n) => n.textContent)
    expect(labels).toEqual(['One', 'Two'])
  })
})

describe('configuration', () => {
  it('shows the default nameplate, a custom one, or none', () => {
    render(
      <Stage>
        <p />
      </Stage>,
    )
    expect(document.querySelector('.matinee-chip')?.textContent).toBe('Agent')

    render(
      <Stage label="Claude">
        <p />
      </Stage>,
    )
    expect(document.querySelector('.matinee-chip')?.textContent).toBe('Claude')

    render(
      <Stage label={false}>
        <p />
      </Stage>,
    )
    expect(document.querySelector('.matinee-chip')).toBeNull()
  })

  it('threads colour, scale and zIndex onto the overlay', () => {
    render(
      <Stage color="#ff0066" scale={1.75} zIndex={4242}>
        <p />
      </Stage>,
    )
    const style = overlay()?.getAttribute('style') ?? ''
    expect(style).toMatch(/--matinee-color:\s*#ff0066/)
    expect(style).toMatch(/--matinee-scale:\s*1\.75/)
    expect(style).toMatch(/z-index:\s*4242/)
  })

  it('defaults to a confident blue', () => {
    render(
      <Stage>
        <p />
      </Stage>,
    )
    expect(overlay()?.getAttribute('style')).toMatch(/--matinee-color:\s*#2f6bff/)
  })

  it('draws no trail by default, a default-length one for `true`, and a set number', () => {
    render(
      <Stage>
        <p />
      </Stage>,
    )
    expect(document.querySelectorAll('.matinee-trail-dot')).toHaveLength(0)

    render(
      <Stage trail>
        <p />
      </Stage>,
    )
    expect(document.querySelectorAll('.matinee-trail-dot')).toHaveLength(8)

    render(
      <Stage trail={5}>
        <p />
      </Stage>,
    )
    expect(document.querySelectorAll('.matinee-trail-dot')).toHaveLength(5)
  })

  it('clamps a silly trail length rather than rendering thousands of nodes', () => {
    render(
      <Stage trail={9999}>
        <p />
      </Stage>,
    )
    expect(document.querySelectorAll('.matinee-trail-dot')).toHaveLength(24)
  })

  it('swaps the glyph, including for arbitrary JSX', () => {
    render(
      <Stage>
        <p />
      </Stage>,
    )
    expect(document.querySelector('.matinee-glyph-svg path')?.getAttribute('d')).toMatch(/^M5 2\.5/)

    render(
      <Stage cursor="hand">
        <p />
      </Stage>,
    )
    expect(document.querySelector('.matinee-glyph-svg path')?.getAttribute('d')).toMatch(/^M9 2\.6/)

    render(
      <Stage cursor={<span id="mine">*</span>}>
        <p />
      </Stage>,
    )
    expect(document.querySelector('#mine')).not.toBeNull()
    expect(document.querySelector('.matinee-glyph-svg')).toBeNull()
  })

  it('changes personality without tearing down the actor', async () => {
    const handles: Cursor[] = []
    const Switcher = (): ReactNode => {
      const [p, setP] = useState<'confident' | 'caffeinated'>('confident')
      return (
        <Stage personality={p}>
          <Capture
            onReady={(c) => {
              handles.push(c)
            }}
          />
          <button id="go" onClick={() => setP('caffeinated')} />
        </Stage>
      )
    }
    render(<Switcher />)
    const before = handles[0]!

    await act(async () => {
      await before.moveTo({ x: 400, y: 300 })
    })
    await act(async () => {
      document.querySelector<HTMLButtonElement>('#go')?.click()
    })

    // The recorded performance survives, so the actor was not replaced.
    expect(before.getScript().steps).toHaveLength(1)
    expect(before.position.x).toBeCloseTo(400, 0)
    expect(document.querySelectorAll('.matinee-overlay')).toHaveLength(1)
  })

  it('keeps one cursor identity for the life of the Stage', async () => {
    // A fresh object on every personality change would re-fire any consumer
    // effect keyed on `cursor`, which for most apps means restarting the
    // performance mid-flight.
    const handles: Cursor[] = []
    const Switcher = (): ReactNode => {
      const [p, setP] = useState<'confident' | 'caffeinated'>('confident')
      const [c, setC] = useState('#2f6bff')
      return (
        <Stage personality={p} color={c}>
          <Capture
            onReady={(x) => {
              handles.push(x)
            }}
          />
          <button
            id="go"
            onClick={() => {
              setP('caffeinated')
              setC('#ff0066')
            }}
          />
        </Stage>
      )
    }
    render(<Switcher />)
    await act(async () => {
      document.querySelector<HTMLButtonElement>('#go')?.click()
    })

    expect(handles.length).toBeGreaterThan(0)
    expect(new Set(handles).size).toBe(1)
  })

  it('reports the performance through onScriptChange', async () => {
    const scripts: number[] = []
    let handle: Cursor | null = null
    render(
      <Stage onScriptChange={(s) => scripts.push(s.steps.length)}>
        <Capture onReady={(c) => (handle = c)} />
      </Stage>,
    )
    await act(async () => {
      await handle!.moveTo({ x: 300, y: 300 })
    })
    expect(scripts).toEqual([1])
  })
})

describe('reduced motion', () => {
  it('jump-cuts when the OS asks for less motion', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))

    let handle: Cursor | null = null
    render(
      <Stage>
        <Capture onReady={(c) => (handle = c)} />
      </Stage>,
    )

    const started = Date.now()
    await act(async () => {
      await handle!.moveTo({ x: 900, y: 640 })
    })
    expect(Date.now() - started).toBeLessThan(80)
    expect(handle!.position).toEqual({ x: 900, y: 640 })
  })

  it('still animates when it is not asked to hold back', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))

    let handle: Cursor | null = null
    render(
      <Stage>
        <Capture onReady={(c) => (handle = c)} />
      </Stage>,
    )

    const started = Date.now()
    await act(async () => {
      await handle!.moveTo({ x: 900, y: 640 })
    })
    expect(Date.now() - started).toBeGreaterThan(120)
  })

  it('honours respectReducedMotion={false} even when the OS asks', async () => {
    vi.stubGlobal('matchMedia', (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }))

    let handle: Cursor | null = null
    render(
      <Stage respectReducedMotion={false}>
        <Capture onReady={(c) => (handle = c)} />
      </Stage>,
    )

    const started = Date.now()
    await act(async () => {
      await handle!.moveTo({ x: 900, y: 640 })
    })
    expect(Date.now() - started).toBeGreaterThan(120)
  })
})

describe('driving a React app', () => {
  it('updates a controlled input through the native setter', async () => {
    let handle: Cursor | null = null

    const Form = (): ReactNode => {
      const [value, setValue] = useState('')
      return (
        <Stage>
          <Capture onReady={(c) => (handle = c)} />
          <input id="field" value={value} onChange={(e) => setValue(e.target.value)} />
          <output id="mirror">{value}</output>
        </Stage>
      )
    }

    render(<Form />)
    const field = document.querySelector<HTMLInputElement>('#field')!
    field.getBoundingClientRect = () =>
      ({ left: 80, top: 60, width: 220, height: 34, right: 300, bottom: 94 }) as DOMRect

    await act(async () => {
      await handle!.type('#field', 'hi')
    })

    // The mirror only updates if React's onChange actually fired, which is the
    // whole point of going through the prototype setter.
    expect(document.querySelector('#mirror')?.textContent).toBe('hi')
  })

  it('fires a React onClick from a staged click', async () => {
    let clicks = 0
    let handle: Cursor | null = null

    render(
      <Stage>
        <Capture onReady={(c) => (handle = c)} />
        <button id="btn" onClick={() => clicks++}>
          go
        </button>
      </Stage>,
    )
    const btn = document.querySelector<HTMLButtonElement>('#btn')!
    btn.getBoundingClientRect = () =>
      ({ left: 10, top: 10, width: 90, height: 30, right: 100, bottom: 40 }) as DOMRect

    await act(async () => {
      await handle!.click('#btn')
    })

    expect(clicks).toBe(1)
  })
})
