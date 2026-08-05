/**
 * The three exports, verified through the public API.
 *
 * happy-dom has no 2D canvas context, no MediaRecorder and no
 * getDisplayMedia, so the canvas and recorder tests install recording fakes.
 * That is deliberate: it lets us assert what the exporter *draws* and what the
 * recorder *does* with the stream, which is the part with logic in it. Pixels
 * and codecs are the browser's job and we are not going to test those here.
 */

import { act, useEffect, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  scriptToPathPng,
  scriptToSvg,
  Stage,
  useCursor,
  useRecorder,
  type Cursor,
  type RecorderHandle,
  type Script,
} from '../src/index'

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
  vi.restoreAllMocks()
})

const SCRIPT: Script = {
  version: 1,
  viewport: { w: 1000, h: 500 },
  seed: 11,
  origin: { x: 20, y: 460 },
  steps: [
    { action: 'move', point: { x: 400, y: 200 }, at: 0, duration: 600 },
    { action: 'click', point: { x: 400, y: 200 }, at: 600, duration: 300 },
    { action: 'dblclick', point: { x: 700, y: 300 }, at: 900, duration: 700 },
  ],
}

/* -------------------------------------------------------------------------- */
/* Canvas fake                                                                 */
/* -------------------------------------------------------------------------- */

type DrawLog = {
  scale: number[][]
  arc: number[][]
  lineTo: number[][]
  stroke: number
  fill: number
}

function fakeCanvas(): DrawLog {
  const log: DrawLog = { scale: [], arc: [], lineTo: [], stroke: 0, fill: 0 }

  const ctx = {
    scale: (...a: number[]) => log.scale.push(a),
    arc: (...a: number[]) => log.arc.push(a),
    lineTo: (...a: number[]) => log.lineTo.push(a),
    moveTo: () => {},
    beginPath: () => {},
    stroke: () => log.stroke++,
    fill: () => log.fill++,
    lineJoin: '',
    lineCap: '',
    strokeStyle: '',
    fillStyle: '',
    lineWidth: 0,
    globalAlpha: 1,
  }

  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
    ctx as unknown as CanvasRenderingContext2D,
  )
  vi.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
    this: HTMLCanvasElement,
    cb: BlobCallback,
  ) {
    cb(new Blob(['\x89PNG\r\n\x1a\n'], { type: 'image/png' }))
  } as HTMLCanvasElement['toBlob'])

  return log
}

/* -------------------------------------------------------------------------- */
/* Cursor handle helpers                                                       */
/* -------------------------------------------------------------------------- */

function Capture({ onReady }: { onReady: (c: Cursor) => void }): ReactNode {
  const cursor = useCursor()
  useEffect(() => {
    onReady(cursor)
  }, [cursor, onReady])
  return null
}

async function mountCursor(props: Record<string, unknown> = {}): Promise<Cursor> {
  let handle: Cursor | null = null
  await act(async () => {
    root.render(
      <Stage {...props}>
        <Capture
          onReady={(c) => {
            handle = c
          }}
        />
      </Stage>,
    )
  })
  return handle!
}

/* -------------------------------------------------------------------------- */
/* SVG                                                                         */
/* -------------------------------------------------------------------------- */

describe('toSvg, through the cursor handle', () => {
  it('exports the performance that was actually recorded', async () => {
    const cursor = await mountCursor()
    await act(async () => {
      await cursor.moveTo({ x: 500, y: 320 })
      await cursor.click({ x: 500, y: 320 })
    })

    const svg = cursor.toSvg()
    const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
    expect(doc.querySelector('parsererror')).toBeNull()
    expect(doc.querySelectorAll('.mt-rip')).toHaveLength(1)
    expect(svg).toMatch(/@keyframes mt-travel/)
  })

  it('inherits the Stage colour and personality without being told', async () => {
    const cursor = await mountCursor({ color: '#ff0066', personality: 'caffeinated' })
    await act(async () => {
      await cursor.moveTo({ x: 400, y: 400 })
    })
    expect(cursor.toSvg()).toContain('#ff0066')
  })

  it('lets an explicit option beat the Stage prop', async () => {
    const cursor = await mountCursor({ color: '#ff0066' })
    await act(async () => {
      await cursor.moveTo({ x: 400, y: 400 })
    })
    const svg = cursor.toSvg({ color: '#00aa55', label: 'Understudy' })
    expect(svg).toContain('#00aa55')
    expect(svg).not.toContain('#ff0066')
    expect(svg).toContain('>Understudy<')
  })

  it('produces a valid, self-contained document for every option combination', () => {
    const combos = [
      {},
      { loop: false },
      { background: '#faf8f4' as const },
      { width: 480 },
      { label: false as const },
      { label: 'A & B <c>' },
      { fps: 12 },
      { backdrop: '<rect id="stage" width="4" height="4"/>' },
      { background: 'transparent' as const, width: 2000, loop: true, label: 'Long name here' },
    ]

    for (const options of combos) {
      const svg = scriptToSvg(SCRIPT, options)
      const doc = new DOMParser().parseFromString(svg, 'image/svg+xml')
      expect(doc.querySelector('parsererror'), JSON.stringify(options)).toBeNull()
      expect(doc.querySelector('svg'), JSON.stringify(options)).not.toBeNull()
      expect(svg).not.toMatch(/<script/i)
      expect(svg).not.toMatch(/xlink:href/)
      // Nothing may be fetched: that is what makes it render in a README. The
      // xmlns is a namespace identifier, not a URL anything resolves, so it is
      // stripped whole rather than having its host filed off.
      expect(svg.replace(/\sxmlns="[^"]*"/g, '')).not.toMatch(/https?:\/\//)
    }
  })

  it('counts one ripple per click and two for a double click', () => {
    const doc = new DOMParser().parseFromString(scriptToSvg(SCRIPT), 'image/svg+xml')
    const rips = doc.querySelectorAll('.mt-rip')
    expect(rips).toHaveLength(2)
    // The dblclick ripple is drawn wider so it reads as a different beat.
    const radii = [...rips].map((r) => Number(r.getAttribute('r'))).sort((a, b) => a - b)
    expect(radii[0]).toBeLessThan(radii[1]!)
  })
})

/* -------------------------------------------------------------------------- */
/* PNG                                                                         */
/* -------------------------------------------------------------------------- */

describe('toPathPng', () => {
  it('returns a PNG blob', async () => {
    fakeCanvas()
    const blob = await scriptToPathPng(SCRIPT)
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe('image/png')
    expect(blob.size).toBeGreaterThan(0)
  })

  it('strokes the whole path and marks every click', async () => {
    const log = fakeCanvas()
    await scriptToPathPng(SCRIPT)

    // A line segment per sample, and a stroke per segment.
    expect(log.lineTo.length).toBeGreaterThan(30)
    expect(log.stroke).toBeGreaterThanOrEqual(log.lineTo.length)

    // Two clicks, each drawn as a ring plus a filled centre.
    expect(log.arc).toHaveLength(4)
    expect(log.fill).toBe(2)
  })

  it('scales the drawing to the requested width and pixel ratio', async () => {
    const log = fakeCanvas()
    await scriptToPathPng(SCRIPT, { width: 500, pixelRatio: 2 })
    // 500/1000 * 2 = 1 on both axes.
    expect(log.scale[0]).toEqual([1, 1])
  })

  it('keeps every drawn point inside the canvas', async () => {
    const log = fakeCanvas()
    await scriptToPathPng(SCRIPT)
    for (const [x, y] of log.lineTo) {
      expect(x).toBeGreaterThanOrEqual(-60)
      expect(x!).toBeLessThanOrEqual(SCRIPT.viewport.w + 60)
      expect(y).toBeGreaterThanOrEqual(-60)
      expect(y!).toBeLessThanOrEqual(SCRIPT.viewport.h + 60)
    }
  })

  it('says so plainly when there is no 2d context', async () => {
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    await expect(scriptToPathPng(SCRIPT)).rejects.toThrow(/2d context/)
  })

  it('is reachable from the cursor handle', async () => {
    fakeCanvas()
    const cursor = await mountCursor()
    await act(async () => {
      await cursor.moveTo({ x: 300, y: 300 })
    })
    await expect(cursor.toPathPng()).resolves.toBeInstanceOf(Blob)
  })
})

/* -------------------------------------------------------------------------- */
/* Video                                                                       */
/* -------------------------------------------------------------------------- */

class FakeMediaRecorder {
  static isTypeSupported = (t: string): boolean => t === 'video/webm;codecs=vp9'
  static last: FakeMediaRecorder | null = null

  state: 'inactive' | 'recording' = 'inactive'
  ondataavailable: ((e: { data: Blob }) => void) | null = null
  onstop: (() => void) | null = null
  readonly mimeType: string

  constructor(
    public stream: unknown,
    options?: { mimeType?: string },
  ) {
    this.mimeType = options?.mimeType ?? ''
    FakeMediaRecorder.last = this
  }

  start(): void {
    this.state = 'recording'
    this.ondataavailable?.({ data: new Blob(['frame'], { type: 'video/webm' }) })
  }

  stop(): void {
    this.state = 'inactive'
    this.onstop?.()
  }
}

function fakeDisplayMedia(impl?: () => Promise<unknown>): { stopped: () => number } {
  let stopped = 0
  const track = {
    stop: () => stopped++,
    addEventListener: () => {},
  }
  const stream = {
    getTracks: () => [track],
    getVideoTracks: () => [track],
  }
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: { getDisplayMedia: impl ?? (() => Promise.resolve(stream)) },
  })
  vi.stubGlobal('MediaRecorder', FakeMediaRecorder)
  vi.stubGlobal('URL', {
    ...URL,
    createObjectURL: () => 'blob:fake',
    revokeObjectURL: () => {},
  })
  return { stopped: () => stopped }
}

function Recorder({ onReady }: { onReady: (r: RecorderHandle) => void }): ReactNode {
  const recorder = useRecorder()
  useEffect(() => {
    onReady(recorder)
  })
  return null
}

async function mountRecorder(): Promise<() => RecorderHandle> {
  let latest: RecorderHandle | null = null
  await act(async () => {
    root.render(
      <Recorder
        onReady={(r) => {
          latest = r
        }}
      />,
    )
  })
  return () => latest!
}

describe('useRecorder', () => {
  it('reports itself unsupported when the browser cannot capture', async () => {
    Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: undefined })
    const get = await mountRecorder()
    expect(get().supported).toBe(false)

    await act(async () => {
      await get().start()
    })
    expect(get().recording).toBe(false)
    expect(get().error?.message).toMatch(/cannot record/)
  })

  it('records, stops, and hands back a WebM blob', async () => {
    const media = fakeDisplayMedia()
    const get = await mountRecorder()
    expect(get().supported).toBe(true)

    await act(async () => {
      await get().start()
    })
    expect(get().recording).toBe(true)
    expect(FakeMediaRecorder.last?.mimeType).toBe('video/webm;codecs=vp9')

    await act(async () => {
      get().stop()
    })
    expect(get().recording).toBe(false)
    // The blob carries the codec that was actually negotiated, not a generic
    // container type, so a consumer can name the file honestly.
    expect(get().blob?.type).toBe('video/webm;codecs=vp9')
    expect(get().blob!.size).toBeGreaterThan(0)
    expect(get().url).toBe('blob:fake')
    // The capture must be released, or the browser keeps saying "sharing".
    expect(media.stopped()).toBe(1)
  })

  it('treats a declined permission prompt as a normal outcome', async () => {
    fakeDisplayMedia(() => Promise.reject(new DOMException('no', 'NotAllowedError')))
    const get = await mountRecorder()

    await act(async () => {
      await get().start()
    })
    expect(get().recording).toBe(false)
    expect(get().error).toBeNull()
    expect(get().blob).toBeNull()
  })

  it('surfaces a real failure', async () => {
    fakeDisplayMedia(() => Promise.reject(new Error('device on fire')))
    const get = await mountRecorder()

    await act(async () => {
      await get().start()
    })
    expect(get().error?.message).toBe('device on fire')
  })

  it('downloads without a blob being a no-op rather than a crash', async () => {
    fakeDisplayMedia()
    const get = await mountRecorder()
    expect(() => get().download()).not.toThrow()
  })

  it('releases the capture when the component goes away mid-recording', async () => {
    const media = fakeDisplayMedia()
    const get = await mountRecorder()
    await act(async () => {
      await get().start()
    })
    expect(get().recording).toBe(true)

    act(() => root.unmount())
    expect(media.stopped()).toBe(1)

    root = createRoot(container)
  })
})
