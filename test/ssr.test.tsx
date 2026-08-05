// @vitest-environment node

/**
 * Server rendering, in an environment with no DOM at all.
 *
 * This runs in the `node` environment on purpose. Under happy-dom there is a
 * `window`, so the SSR guards never get exercised and the test would pass
 * while the real thing threw in Next.js.
 */

import { renderToString } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { Stage, useCursor } from '../src/index'

describe('server rendering', () => {
  it('renders children and nothing cursor-related', () => {
    const html = renderToString(
      <Stage>
        <main id="app">Hello</main>
      </Stage>,
    )
    expect(html).toContain('<main id="app">Hello</main>')
    expect(html).not.toContain('matinee-overlay')
    expect(html).not.toContain('matinee-cursor')
  })

  it('survives an app that starts performing during render', () => {
    const Eager = (): null => {
      const cursor = useCursor()
      // A no-op on the server rather than a crash: every method resolves.
      void cursor.moveTo('#anything')
      void cursor.click('#anything')
      void cursor.say('hello')
      return null
    }

    expect(() =>
      renderToString(
        <Stage>
          <Eager />
        </Stage>,
      ),
    ).not.toThrow()
  })

  it('hands out a complete, inert cursor with no window', () => {
    let captured: ReturnType<typeof useCursor> | null = null
    const Grab = (): null => {
      captured = useCursor()
      return null
    }
    renderToString(
      <Stage>
        <Grab />
      </Stage>,
    )

    const cursor = captured!
    for (const method of [
      'moveTo',
      'click',
      'dblclick',
      'type',
      'scrollTo',
      'hover',
      'pause',
      'say',
      'show',
      'hide',
      'play',
      'getScript',
      'clearScript',
      'toSvg',
      'toPathPng',
    ] as const) {
      expect(typeof cursor[method], `${method} missing on the server`).toBe('function')
    }

    expect(cursor.position).toEqual({ x: 0, y: 0 })
    expect(cursor.getScript().steps).toEqual([])
    expect(cursor.toSvg()).toBe('')
  })

  it('resolves its promises rather than hanging a server render', async () => {
    let captured: ReturnType<typeof useCursor> | null = null
    const Grab = (): null => {
      captured = useCursor()
      return null
    }
    renderToString(
      <Stage>
        <Grab />
      </Stage>,
    )

    await expect(captured!.moveTo({ x: 1, y: 1 })).resolves.toBeUndefined()
    await expect(captured!.pause(10)).resolves.toBeUndefined()
  })
})
