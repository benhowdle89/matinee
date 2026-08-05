/**
 * Video export, honestly.
 *
 * This records the real tab through getDisplayMedia and MediaRecorder. That
 * means one browser permission prompt, and it means the visitor picks what
 * gets shared. There is no way around the prompt — a page cannot capture
 * itself unasked, and it should not be able to.
 *
 * The alternative (walking the DOM onto a canvas) is a rabbit hole that
 * produces something subtly wrong for every non-trivial page. We don't.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export type RecorderOptions = {
  /** Overrides the codec probe. Rarely needed. */
  mimeType?: string
  /** Video bitrate in bits per second. */
  videoBitsPerSecond?: number
}

export type RecorderHandle = {
  /** False when the browser has no getDisplayMedia or no MediaRecorder. */
  supported: boolean
  recording: boolean
  blob: Blob | null
  /** Object URL for `blob`, revoked automatically when it is replaced. */
  url: string | null
  error: Error | null
  start: () => Promise<void>
  stop: () => void
  download: (filename?: string) => void
}

const CANDIDATES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
]

function pickMimeType(preferred?: string): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined
  if (preferred && MediaRecorder.isTypeSupported(preferred)) return preferred
  return CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t))
}

export function useRecorder(options: RecorderOptions = {}): RecorderHandle {
  const [recording, setRecording] = useState(false)
  const [blob, setBlob] = useState<Blob | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [error, setError] = useState<Error | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<BlobPart[]>([])
  const urlRef = useRef<string | null>(null)

  const supported =
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getDisplayMedia === 'function' &&
    typeof MediaRecorder !== 'undefined'

  const teardown = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recorderRef.current = null
  }, [])

  const start = useCallback(async () => {
    if (!supported) {
      setError(new Error('matinee: this browser cannot record the screen'))
      return
    }
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        // `preferCurrentTab` is Chromium-only and simply ignored elsewhere,
        // where the user picks the tab from the standard chooser.
        preferCurrentTab: true,
        video: { frameRate: 60 },
        audio: false,
      } as DisplayMediaStreamOptions)

      streamRef.current = stream
      chunksRef.current = []

      const mimeType = pickMimeType(options.mimeType)
      const recorder = new MediaRecorder(stream, {
        ...(mimeType ? { mimeType } : {}),
        ...(options.videoBitsPerSecond
          ? { videoBitsPerSecond: options.videoBitsPerSecond }
          : {}),
      })
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const out = new Blob(chunksRef.current, { type: mimeType ?? 'video/webm' })
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        const next = URL.createObjectURL(out)
        urlRef.current = next
        setBlob(out)
        setUrl(next)
        setRecording(false)
        teardown()
      }

      // Ending the share from the browser's own "stop sharing" bar has to end
      // the recording too, or we sit here writing an empty file.
      stream.getVideoTracks()[0]?.addEventListener('ended', () => {
        if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      })

      recorder.start(200)
      setRecording(true)
    } catch (err) {
      // A declined permission prompt is a normal outcome, not a failure.
      if (err instanceof DOMException && err.name === 'NotAllowedError') {
        teardown()
        return
      }
      setError(err instanceof Error ? err : new Error(String(err)))
      teardown()
    }
  }, [supported, options.mimeType, options.videoBitsPerSecond, teardown])

  const stop = useCallback(() => {
    if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
  }, [])

  const download = useCallback(
    (filename = 'matinee.webm') => {
      if (!urlRef.current) return
      const a = document.createElement('a')
      a.href = urlRef.current
      a.download = filename
      document.body.appendChild(a)
      a.click()
      a.remove()
    },
    [],
  )

  useEffect(() => {
    return () => {
      if (recorderRef.current?.state === 'recording') recorderRef.current.stop()
      teardown()
      if (urlRef.current) URL.revokeObjectURL(urlRef.current)
    }
  }, [teardown])

  return { supported, recording, blob, url, error, start, stop, download }
}
