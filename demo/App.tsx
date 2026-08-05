/**
 * The demo page performs itself.
 *
 * Everything the cursor touches here is a real control — the copy button
 * really copies, the personality switcher really switches, the input really
 * receives the typing. Nothing is mimed. That is the argument.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { Stage, useCursor, useRecorder, type PersonalityName } from 'matinee'

const PERSONALITIES: PersonalityName[] = ['confident', 'curious', 'caffeinated']
const NARROW = 680

export function App() {
  const [personality, setPersonality] = useState<PersonalityName>('confident')
  const [label, setLabel] = useState('Agent')
  const [trail, setTrail] = useState(false)

  return (
    <Stage personality={personality} label={label || false} trail={trail} color="#2f6bff">
      <Page
        personality={personality}
        setPersonality={setPersonality}
        label={label}
        setLabel={setLabel}
        trail={trail}
        setTrail={setTrail}
      />
    </Stage>
  )
}

type PageProps = {
  personality: PersonalityName
  setPersonality: (p: PersonalityName) => void
  label: string
  setLabel: (s: string) => void
  trail: boolean
  setTrail: (b: boolean) => void
}

function Page({
  personality,
  setPersonality,
  label,
  setLabel,
  trail,
  setTrail,
}: PageProps) {
  const cursor = useCursor()
  const recorder = useRecorder()
  const [copied, setCopied] = useState(false)
  const [sample, setSample] = useState('')
  const [performing, setPerforming] = useState(false)
  const hasPerformed = useRef(false)

  const copy = useCallback(() => {
    navigator.clipboard?.writeText('npm install matinee').catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1800)
  }, [])

  const perform = useCallback(async () => {
    setPerforming(true)
    setSample('')
    cursor.clearScript()

    const narrow = window.innerWidth < NARROW

    await cursor.pause(500)
    await cursor.scrollTo('#install')
    await cursor.click('#copy')
    await cursor.pause(400)

    // The full performance is a lot of travel for a phone. Under 680px it
    // keeps the two beats that make the point and drops the rest.
    if (!narrow) {
      await cursor.scrollTo('#playground')
      await cursor.click('#personality-caffeinated')
      await cursor.pause(500)
      await cursor.hover('#trail-toggle', 300)
      await cursor.click('#trail-toggle')
      await cursor.pause(300)
    }

    await cursor.type('#sample-input', 'hello from matinee')
    await cursor.pause(300)
    await cursor.say('your turn', 2600)
    setPerforming(false)
  }, [cursor])

  // On load, after a beat — but never against someone who asked for less
  // motion, and never twice.
  useEffect(() => {
    if (hasPerformed.current) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    hasPerformed.current = true
    const id = setTimeout(() => void perform(), 900)
    return () => clearTimeout(id)
  }, [perform])

  const downloadSvg = useCallback(() => {
    const svg = cursor.toSvg({ width: 900, label: label || false })
    const blob = new Blob([svg], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'matinee.svg'
    a.click()
    URL.revokeObjectURL(url)
  }, [cursor, label])

  return (
    <main>
      <header className="hero">
        <h1 className="wordmark">matinee</h1>
        <p className="tagline">Staged cursor performances for React.</p>
        <p className="lede">
          Every AI product demo shows a cursor using software. Almost all of them are faked by hand
          in After Effects, and they have to be redone every time the UI changes. This one is
          programmable, it drives your real app, and it exports itself as an animated SVG.
        </p>
        <p className="watching">
          {performing ? (
            <span className="live">
              <span className="dot" /> performing now — nothing here is mimed
            </span>
          ) : (
            <span className="idle">that was matinee, performing this page</span>
          )}
        </p>
      </header>

      <section id="install" className="section">
        <h2>Install</h2>
        <div className="install-row">
          <code>npm install matinee</code>
          <button id="copy" className="btn" onClick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>

        <h2 className="spaced">Two lines</h2>
        <pre className="code">
          <code>{`import { Stage } from 'matinee'
import 'matinee/styles.css'

<Stage>
  <YourApp />
</Stage>`}</code>
        </pre>

        <h2 className="spaced">Then direct it</h2>
        <pre className="code">
          <code>{`const cursor = useCursor()

await cursor.moveTo('#search')
await cursor.type('#search', 'invoices from March')
await cursor.click('#submit')
await cursor.say('and there it is')`}</code>
        </pre>
      </section>

      <section id="playground" className="section">
        <h2>Playground</h2>
        <p className="note">
          Change these and hit Replay. The cursor is the only colour on this page for a reason.
        </p>

        <div className="controls">
          <fieldset>
            <legend>Personality</legend>
            <div className="row">
              {PERSONALITIES.map((p) => (
                <button
                  key={p}
                  id={`personality-${p}`}
                  className={`btn ${personality === p ? 'is-on' : ''}`}
                  onClick={() => setPersonality(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend>Nameplate</legend>
            <input
              id="label-input"
              className="field"
              value={label}
              placeholder="empty to hide"
              onChange={(e) => setLabel(e.target.value)}
            />
          </fieldset>

          <fieldset>
            <legend>Trail</legend>
            <button
              id="trail-toggle"
              className={`btn ${trail ? 'is-on' : ''}`}
              onClick={() => setTrail(!trail)}
            >
              {trail ? 'on' : 'off'}
            </button>
          </fieldset>
        </div>

        <fieldset className="sample">
          <legend>A real input, receiving real keystrokes</legend>
          <input
            id="sample-input"
            className="field wide"
            value={sample}
            placeholder="the cursor will type here"
            onChange={(e) => setSample(e.target.value)}
          />
        </fieldset>

        <div className="row actions">
          <button className="btn primary" onClick={() => void perform()} disabled={performing}>
            {performing ? 'Performing…' : 'Replay'}
          </button>

          <button className="btn" onClick={downloadSvg}>
            Download as SVG
          </button>

          {recorder.supported && (
            <button
              className={`btn ${recorder.recording ? 'is-rec' : ''}`}
              onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
            >
              {recorder.recording ? 'Stop recording' : 'Record this'}
            </button>
          )}

          {recorder.url && (
            <button className="btn" onClick={() => recorder.download('matinee-demo.webm')}>
              Download WebM
            </button>
          )}
        </div>

        {recorder.supported && (
          <p className="note small">
            Recording asks the browser for permission and captures the real tab. There is no way
            around the prompt, and there shouldn&rsquo;t be.
          </p>
        )}
        {recorder.error && <p className="note small error">{recorder.error.message}</p>}
      </section>

      <section className="section">
        <h2>Why the motion looks right</h2>
        <dl className="reasons">
          <div>
            <dt>Curved paths</dt>
            <dd>
              Every journey is a cubic bezier bowed perpendicular to the straight line, randomised
              within the personality&rsquo;s bounds. Two trips between the same two buttons never
              trace the same arc.
            </dd>
          </div>
          <div>
            <dt>Minimum-jerk velocity</dt>
            <dd>
              The easing is 10t³ − 15t⁴ + 6t⁵, the standard model from motor control research for
              how a human arm moves between two points. It was not picked by eye.
            </dd>
          </div>
          <div>
            <dt>Overshoot and settle</dt>
            <dd>
              Human reaching is two movements: a fast ballistic throw that lands slightly wrong,
              then a small corrective one. A single smooth arrival is the tell that gives away every
              tweened cursor.
            </dd>
          </div>
          <div>
            <dt>A tremor underneath</dt>
            <dd>Sub-pixel, never repeating, fading out as the cursor settles.</dd>
          </div>
        </dl>
      </section>

      <footer className="footer">
        <a href="https://github.com/benhowdle89/matinee">GitHub</a>
        <a href="https://www.npmjs.com/package/matinee">npm</a>
        <span>MIT © Ben Howdle</span>
      </footer>
    </main>
  )
}
