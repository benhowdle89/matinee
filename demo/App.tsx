/**
 * The demo page performs itself.
 *
 * Everything the cursor touches here is a real control: the copy button
 * really copies, the personality switcher really switches, the input really
 * receives the typing. Nothing is mimed. That is the argument.
 *
 * The exports section is the other half of the argument. Rather than showing
 * pre-rendered screenshots the way the README has to, it calls toSvg() live
 * with whatever settings the visitor has picked and renders the result inline.
 * What you see is the file you would get.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  PERSONALITIES,
  scriptToPathPng,
  scriptToSvg,
  Stage,
  useCursor,
  useRecorder,
  type PersonalityName,
} from 'matinee'
import { SCENE_BACKGROUND, SCENE_W, sceneBackdrop, sceneScript } from './scene'

const PERSONALITY_NAMES: PersonalityName[] = ['confident', 'curious', 'caffeinated']
const NARROW = 680
const ACCENT = '#2f6bff'

const USE_CASES: Array<{ title: string; body: string }> = [
  {
    title: 'Product demos',
    body: 'The nine-second clip for your landing page, your changelog, your launch tweet. Regenerate it the day the UI changes instead of putting it on someone’s to-do list.',
  },
  {
    title: 'Docs and tutorials',
    body: '"Open settings, then billing, then Upgrade" becomes a small animation that plays inline, in a README, with no video player and no hosting.',
  },
  {
    title: 'Marketing and social',
    body: 'Record the tab to WebM and post it. Same script, different personality, nameplate and colour, so one performance yields a family of assets.',
  },
  {
    title: 'Onboarding walkthroughs',
    body: 'The cursor drives the real UI, so a guided tour can genuinely do the thing rather than pointing at a hole in a dimmed overlay.',
  },
  {
    title: 'Agent and AI demos',
    body: 'Every AI product demo shows a cursor using software on the user’s behalf. matinee is built for exactly that shot, nameplate and all.',
  },
  {
    title: 'Design review and bugs',
    body: 'A script is a precise, replayable description of an interaction. Attach it to the issue and anyone can watch the same twelve steps happen.',
  },
]

export function App() {
  const [personality, setPersonality] = useState<PersonalityName>('confident')
  const [label, setLabel] = useState('Agent')
  const [trail, setTrail] = useState(false)

  return (
    <Stage personality={personality} label={label || false} trail={trail} color={ACCENT}>
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

/** Small enough to inline as a data URL, so there is no blob to revoke. */
function dataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function Page({ personality, setPersonality, label, setLabel, trail, setTrail }: PageProps) {
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

  // On load, after a beat, but never against someone who asked for less
  // motion, and never twice.
  useEffect(() => {
    if (hasPerformed.current) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    hasPerformed.current = true
    const id = setTimeout(() => void perform(), 900)
    return () => clearTimeout(id)
  }, [perform])

  /* ---------------------------------------------------------------------- */
  /* Live exports                                                            */
  /* ---------------------------------------------------------------------- */

  // Both exports are the same purpose-built take over a wireframe stage,
  // rather than this page's performance: toSvg() records the cursor and not
  // the page, so exporting what just happened here would hand the visitor a
  // cursor floating in a void. See demo/scene.ts.
  const common = useMemo(
    () => ({
      width: SCENE_W,
      color: ACCENT,
      label: label || (false as const),
      traits: PERSONALITIES[personality],
      fps: 30,
    }),
    [label, personality],
  )

  const clipSvg = useMemo(
    () => scriptToSvg(sceneScript(), { ...common, background: SCENE_BACKGROUND, backdrop: sceneBackdrop(ACCENT) }),
    [common],
  )
  const overlaySvg = useMemo(() => scriptToSvg(sceneScript(), common), [common])

  // The PNG needs a real canvas and is therefore async, so unlike the SVGs it
  // cannot just be computed during render.
  const [pngUrl, setPngUrl] = useState<string | null>(null)
  useEffect(() => {
    let cancelled = false
    let created: string | null = null
    void scriptToPathPng(sceneScript(), {
      width: SCENE_W,
      color: ACCENT,
      traits: PERSONALITIES[personality],
    })
      .then((blob) => {
        if (cancelled) return
        created = URL.createObjectURL(blob)
        setPngUrl(created)
      })
      .catch(() => {})
    return () => {
      cancelled = true
      if (created) URL.revokeObjectURL(created)
    }
  }, [personality])

  const [pngBusy, setPngBusy] = useState(false)
  const downloadPng = useCallback(async () => {
    setPngBusy(true)
    try {
      const blob = await scriptToPathPng(sceneScript(), {
        width: SCENE_W,
        color: ACCENT,
        traits: PERSONALITIES[personality],
      })
      download(blob, 'matinee-path.png')
    } finally {
      setPngBusy(false)
    }
  }, [personality])

  const svgBlob = (svg: string): Blob => new Blob([svg], { type: 'image/svg+xml' })

  return (
    <main>
      <header className="hero">
        <h1 className="wordmark">matinee</h1>
        <p className="tagline">Staged cursor performances for React.</p>
        <p className="lede">
          A programmable ghost cursor that drives your real app, moving like a hand rather than a
          tween, then exports itself as a file you can commit.
        </p>
        <p className="watching">
          {performing ? (
            <span className="live">
              <span className="dot" /> performing now, nothing here is mimed
            </span>
          ) : (
            <span className="idle">that was matinee, performing this page</span>
          )}
        </p>
      </header>

      <section className="section">
        <h2>The problem</h2>
        <p className="note">
          Your product does something. To show anyone, you need footage of it being used. You can
          screen-record it, which needs a person and a steady hand and a re-record every time the UI
          changes. Or you can fake it in After Effects, which needs a designer and has the same
          problem, more expensively.
        </p>
        <p className="note">
          Either way you end up with a binary file that was accurate on the day it was made. Ship a
          redesign and every demo you own is quietly wrong.
        </p>
        <div className="claims">
          <div>
            <b>Write it as code</b>
            <span>Rerun it after a redesign and you have a current demo. No re-shoot.</span>
          </div>
          <div>
            <b>Review it as a diff</b>
            <span>It lives in your repo, next to the feature it demonstrates.</span>
          </div>
          <div>
            <b>Reproduce it exactly</b>
            <span>Same script every time. One per locale, per plan, per theme.</span>
          </div>
        </div>
      </section>

      <section className="section">
        <h2>What it unlocks</h2>
        <dl className="uses">
          {USE_CASES.map((u) => (
            <div key={u.title}>
              <dt>{u.title}</dt>
              <dd>{u.body}</dd>
            </div>
          ))}
        </dl>
      </section>

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
        <p className="note small">
          Everything queues, so <code>await</code> is optional. Targets resolve when the step runs,
          not when you write it. The clicks are real events on real elements, which is why this page
          responds to its own cursor.
        </p>
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
              {PERSONALITY_NAMES.map((p) => (
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
        </div>
      </section>

      <section id="exports" className="section">
        <h2>What you get out</h2>
        <p className="note">
          These are generated right now, in your browser, from the settings above. Change the
          personality or the nameplate and they change with them. This is the actual file, not a
          picture of one.
        </p>

        <div className="exports">
          <figure>
            <img src={dataUrl(clipSvg)} alt="An animated cursor performance on a wireframe card" />
            <figcaption>
              <b>Animated SVG, self-contained</b>
              <span>
                A background and some scenery, so the file stands alone. Drops into a README and
                animates there. This one is {Math.round(clipSvg.length / 1024)} kB.
              </span>
              <button className="btn" onClick={() => download(svgBlob(clipSvg), 'matinee-clip.svg')}>
                Download
              </button>
            </figcaption>
          </figure>

          <figure>
            <img
              className="on-checks"
              src={dataUrl(overlaySvg)}
              alt="The same performance with no scenery, on a transparent background"
            />
            <figcaption>
              <b>Animated SVG, transparent (the default)</b>
              <span>
                The same performance with no scenery. It looks sparse because it is meant to go on
                top of a screenshot you already have. The chequerboard is transparency.
              </span>
              <button
                className="btn"
                onClick={() => download(svgBlob(overlaySvg), 'matinee-overlay.svg')}
              >
                Download
              </button>
            </figcaption>
          </figure>

          <figure>
            {pngUrl && (
              <img
                className="on-checks"
                src={pngUrl}
                alt="The curved path the cursor travelled, with a ring at each click"
              />
            )}
            <figcaption>
              <b>Path still, as PNG</b>
              <span>
                The journey with a marker at every click, on transparency. Good for a slide or a
                diagram.
              </span>
              <button className="btn" onClick={() => void downloadPng()} disabled={pngBusy}>
                {pngBusy ? 'Drawing…' : 'Download PNG'}
              </button>
            </figcaption>
          </figure>

          <figure>
            <figcaption className="solo">
              <b>Video, as WebM</b>
              <span>
                Records the real tab through the browser. It costs one permission prompt, and there
                is no way around that, nor should there be.
              </span>
              <span className="row">
                {recorder.supported ? (
                  <button
                    className={`btn ${recorder.recording ? 'is-rec' : ''}`}
                    onClick={() => (recorder.recording ? recorder.stop() : void recorder.start())}
                  >
                    {recorder.recording ? 'Stop recording' : 'Record this tab'}
                  </button>
                ) : (
                  <span className="note small">Your browser cannot capture the screen.</span>
                )}
                {recorder.url && (
                  <button className="btn" onClick={() => recorder.download('matinee-demo.webm')}>
                    Download WebM
                  </button>
                )}
              </span>
              {recorder.error && <span className="note small error">{recorder.error.message}</span>}
            </figcaption>
          </figure>
        </div>

        <p className="note small">
          One thing worth knowing: <code>toSvg()</code> exports the cursor, never your page. matinee
          does not rasterise the DOM, so the file has no idea what your app looks like. That is why
          the transparent one is the default and why the self-contained one takes a{' '}
          <code>backdrop</code> of your own SVG.
        </p>
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

      <section className="section">
        <h2>The rest</h2>
        <p className="note">
          Full API for the actor and the stage, the script format, the export options and the
          accessibility notes are in the README.
        </p>
        <div className="row">
          <a className="btn primary" href="https://github.com/benhowdle89/matinee">
            Read the docs on GitHub
          </a>
          <a className="btn" href="https://www.npmjs.com/package/matinee">
            View on npm
          </a>
        </div>
      </section>

      <footer className="footer">
        <a href="https://github.com/benhowdle89/matinee">GitHub</a>
        <a href="https://www.npmjs.com/package/matinee">npm</a>
        <span>Zero runtime dependencies</span>
        <span>MIT © Ben Howdle</span>
      </footer>
    </main>
  )
}
