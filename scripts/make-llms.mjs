/**
 * Generates the machine-readable docs.
 *
 *   demo/public/llms.txt        the llms.txt index, per llmstxt.org
 *   demo/public/llms-full.txt   the whole documentation set in one file
 *   llms.txt                    a copy at the repo root, for GitHub
 *
 * The API section is the shipped dist/index.d.ts verbatim rather than a
 * hand-written summary. Declarations carry their JSDoc, models read TypeScript
 * fluently, and above all it cannot drift from what people actually install.
 *
 * Everything else here is the stuff a model gets wrong when it has only read
 * the marketing: what matinee is not, which methods exist, and the handful of
 * behaviours that are surprising until someone says them out loud.
 *
 *   npm run build && node scripts/make-llms.mjs
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf8'))
const types = readFileSync(resolve(root, 'dist/index.d.ts'), 'utf8')

const SITE = 'https://matinee.pages.dev'
const REPO = 'https://github.com/benhowdle89/matinee'

/* -------------------------------------------------------------------------- */
/* llms.txt: the index                                                         */
/* -------------------------------------------------------------------------- */

const index = `# matinee

> A React component for staged cursor performances. A programmable ghost cursor that drives your real app with real events, moving like a hand rather than a tween, then exports the performance as a self-contained animated SVG, a WebM recording, or a PNG still.

matinee solves a documentation and marketing problem: product demos are normally screen-recorded or faked in After Effects, so they go stale the moment the UI changes. With matinee the demo is code, so it can be rerun after a redesign, reviewed as a diff, and reproduced per locale or plan or theme.

Current version: ${pkg.version}. React ${pkg.peerDependencies.react} as a peer dependency. Zero runtime dependencies.

## Docs

- [Full documentation](${SITE}/llms-full.txt): complete usage guide, recipes, gotchas, and the entire TypeScript API surface in one file
- [README](${REPO}/blob/main/README.md): the same material with images
- [Live demo](${SITE}): a page that performs itself and generates its exports in the browser

## Source

- [Repository](${REPO})
- [npm package](https://www.npmjs.com/package/matinee)

## Optional

- [Handoff notes](${REPO}/blob/main/HANDOFF.md): design decisions, tuning values, and known rough edges
`

/* -------------------------------------------------------------------------- */
/* llms-full.txt: everything                                                   */
/* -------------------------------------------------------------------------- */

const full = `# matinee

> Staged cursor performances for React. Version ${pkg.version}.

A programmable ghost cursor. You script it, it performs against your real
running app using real DOM events, and then it exports itself as a file you can
commit.

Package: matinee (npm)
Repository: ${REPO}
Demo: ${SITE}
License: MIT
Peer dependency: react ${pkg.peerDependencies.react}
Runtime dependencies: none

## Install

\`\`\`sh
npm install matinee
\`\`\`

## Minimal complete example

This is a working file. Nothing is elided.

\`\`\`tsx
import { useEffect } from 'react'
import { Stage, useCursor } from 'matinee'
import 'matinee/styles.css'

function Demo() {
  const cursor = useCursor()

  useEffect(() => {
    void (async () => {
      await cursor.moveTo('#search')
      await cursor.type('#search', 'invoices from March')
      await cursor.click('#submit')
      await cursor.say('and there it is')
    })()
  }, [cursor])

  return <YourApp />
}

export default function Root() {
  return (
    <Stage label="Agent" personality="confident">
      <Demo />
    </Stage>
  )
}
\`\`\`

Two required pieces:

1. Wrap the app in \`<Stage>\`. It renders children untouched and mounts one
   fixed, pointer-events:none, aria-hidden overlay. It never affects layout.
2. Import \`matinee/styles.css\` once. Without it the cursor is invisible.

\`useCursor()\` must be called inside a \`<Stage>\`. It throws otherwise.

## Core concepts

**The actor** is what performs. You reach it with \`useCursor()\`.

**Targets** are how you say where. A target is one of:
- a CSS selector string, for example \`'#submit'\` or \`'.row:nth-child(2) button'\`
- a DOM \`Element\`
- a React ref, meaning an object with a \`.current\` property
- a point, \`{ x: number, y: number }\`, in viewport coordinates

Targets are resolved **when the step runs, not when you write it**. A selector
that does not exist yet is fine as long as it exists by the time the queue
reaches it. If it still does not match, matinee logs a warning and the cursor
stays put rather than throwing.

**The queue.** Every method returns a promise that resolves when its motion
finishes, and queues behind whatever is already running. This means \`await\` is
optional and the order of your calls is always the order of execution. These
two are equivalent:

\`\`\`ts
await cursor.moveTo('#a'); await cursor.click('#a')
cursor.moveTo('#a'); cursor.click('#a')
\`\`\`

**Real events.** \`click\` dispatches genuine \`pointerdown\`, \`mousedown\`,
\`pointerup\`, \`mouseup\` and \`click\` events on the resolved element, so React
\`onClick\` handlers fire. \`type\` writes through the prototype value setter and
dispatches \`input\`, which is what makes React controlled inputs actually update.

**Scripts.** Every performance records itself as plain JSON while it runs.
\`cursor.getScript()\` returns it; \`cursor.play(script)\` replays it.

## Recipes

### Fill and submit a form

\`\`\`ts
await cursor.click('#email')
await cursor.type('#email', 'ada@example.com')
await cursor.type('#password', 'hunter2')
await cursor.click('button[type="submit"]')
\`\`\`

### Scroll to something below the fold first

\`\`\`ts
await cursor.scrollTo('#pricing')
await cursor.hover('#pro-plan', 800)
await cursor.click('#upgrade')
\`\`\`

### Narrate with a speech bubble

\`\`\`ts
await cursor.say('first, search for the invoice')
await cursor.type('#search', 'INV-0042')
await cursor.say('and there it is', 2000)
\`\`\`

### Export an animated SVG for a README

\`\`\`ts
const svg = cursor.toSvg({
  background: '#faf8f4',
  backdrop: '<rect x="24" y="24" width="512" height="212" rx="10" fill="#fff"/>',
  width: 720,
})
// write svg to a .svg file, commit it, then in markdown:
// <img src="assets/demo.svg" width="720">
\`\`\`

### Record the tab to WebM

\`\`\`tsx
const recorder = useRecorder()
// recorder.start() triggers a browser permission prompt. This is unavoidable.
// recorder.stop() then fills recorder.blob and recorder.url.
// recorder.download('demo.webm') saves it.
\`\`\`

### Replay a saved performance

\`\`\`ts
const script = cursor.getScript()
localStorage.setItem('demo', JSON.stringify(script))

// later, possibly in another session
import { validateScript } from 'matinee'
await cursor.play(validateScript(JSON.parse(localStorage.getItem('demo'))))
\`\`\`

## Behaviours that surprise people

- **\`toSvg()\` exports the cursor, never your page.** matinee does not
  rasterise the DOM. With no options you get the cursor, nameplate and click
  ripples on a transparent background, intended to be laid over a screenshot
  you already have. To produce a standalone clip, pass \`background\` and a
  \`backdrop\` of your own raw SVG markup.
- **A performance containing \`scrollTo\` cannot be exported coherently.**
  Recorded points are viewport coordinates and the export has no concept of a
  scroll offset, so points either side of a scroll do not relate to each other.
  Keep exportable takes scroll-free.
- **\`say()\` is not rendered in SVG exports.** It shows live but the exporter
  treats it as a pause.
- **The exported SVG contains no \`<script>\` and no external references.** This
  is deliberate and is what makes it animate inside a GitHub README, which
  serves images under \`default-src 'none'; style-src 'unsafe-inline'; sandbox\`.
- **Reduced motion is honoured everywhere.** Under
  \`prefers-reduced-motion: reduce\` the cursor jump-cuts between positions
  instead of animating, and the exported SVG shows a still frame. Set
  \`respectReducedMotion={false}\` on \`<Stage>\` to override.
- **\`useCursor()\` returns a stable object** for the life of the \`<Stage>\`, so
  it is safe in a \`useEffect\` dependency array.
- **Server rendering is safe.** On the server \`<Stage>\` renders children only,
  and every cursor method is a resolved no-op, so an app that performs on mount
  does not throw in Node.
- **\`scrollTo\` only handles vertical scrolling.**

## What matinee is not, and does not do

Do not generate code that assumes any of the following, because none of it
exists:

- No multiple simultaneous cursors. One actor per \`<Stage>\`.
- No GIF export. SVG, WebM and PNG only.
- No headless or CLI rendering. It runs in a browser.
- No drag and drop action. There is no \`cursor.drag()\`.
- No framework adapters. React only, no Vue, Svelte or vanilla build.
- No plugin system, no middleware, no custom action registration.
- No recorder that captures a real user's mouse into a script. Scripts are
  written by hand or produced by running a performance.
- No DOM to canvas or DOM to image rendering of your app.

Related but different tools, in case one of them is what was actually wanted:
ghost-cursor is human-like mouse movement for Puppeteer built for bot evasion;
Screen Studio records a real screen; rrweb records and replays real user
sessions.

## Complete API

The following is the shipped TypeScript declaration file, verbatim.

\`\`\`ts
${types.trim()}
\`\`\`
`

/* -------------------------------------------------------------------------- */

const outputs = [
  [resolve(root, 'demo/public/llms.txt'), index],
  [resolve(root, 'demo/public/llms-full.txt'), full],
  [resolve(root, 'llms.txt'), index],
]

for (const [path, body] of outputs) {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, body)
  console.log(`  ${(body.length / 1024).toFixed(1).padStart(6)} kB  ${path.replace(root + '/', '')}`)
}

// The API section is the whole point; a build that silently emitted an empty
// one would be worse than no file.
if (!full.includes('declare const PERSONALITIES') && !full.includes('PERSONALITIES')) {
  throw new Error('llms-full.txt is missing the API surface')
}
if (full.length < 6000) {
  throw new Error(`llms-full.txt looks truncated (${full.length} bytes)`)
}
