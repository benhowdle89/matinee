/**
 * Installs matinee from a packed tarball into a throwaway project and uses it
 * the way a consumer would.
 *
 * The unit suite imports from ./src, which proves the code works but proves
 * nothing about the thing people actually download: the exports map, the
 * bundled output, the type declarations, the CSS subpath, the dependency list.
 * Every one of those has been broken by a config change at some point in the
 * history of software, and none of them are covered by importing ../src.
 *
 * Deliberately a script rather than a vitest file: it shells out to npm and
 * takes tens of seconds, which does not belong in a watch-mode suite.
 *
 *   npm run build && npm run verify
 */

import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const checks = []
let failed = 0

function check(name, fn) {
  try {
    fn()
    checks.push(`  ok    ${name}`)
  } catch (err) {
    failed++
    checks.push(`  FAIL  ${name}\n          ${err.message.split('\n')[0]}`)
  }
}

function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...opts,
  })
}

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

/* -------------------------------------------------------------------------- */

if (!existsSyncSafe(join(ROOT, 'dist', 'index.js'))) {
  console.error('no dist/ found. Run `npm run build` first.')
  process.exit(1)
}

function existsSyncSafe(p) {
  try {
    readFileSync(p)
    return true
  } catch {
    return false
  }
}

const work = mkdtempSync(join(tmpdir(), 'matinee-verify-'))
const app = join(work, 'app')
mkdirSync(app, { recursive: true })

console.log(`packing matinee and installing it into ${app}`)

let tarball
try {
  const packed = run('npm', ['pack', '--pack-destination', work, '--json'], { cwd: ROOT })
  tarball = join(work, JSON.parse(packed)[0].filename)

  writeFileSync(
    join(app, 'package.json'),
    JSON.stringify({ name: 'consumer', version: '1.0.0', type: 'module', private: true }, null, 2),
  )

  run(
    'npm',
    [
      'install',
      '--no-audit',
      '--no-fund',
      '--loglevel=error',
      tarball,
      'react@^18',
      'react-dom@^18',
      '@types/react@^18',
      '@types/react-dom@^18',
    ],
    { cwd: app },
  )
} catch (err) {
  console.error('could not install the packed tarball:\n', err.stdout || err.message)
  rmSync(work, { recursive: true, force: true })
  process.exit(1)
}

const installed = JSON.parse(readFileSync(join(app, 'node_modules', 'matinee', 'package.json'), 'utf8'))

/* -------------------------------------------------------------------------- */
/* What got installed                                                          */
/* -------------------------------------------------------------------------- */

check('ships no runtime dependencies', () => {
  const deps = Object.keys(installed.dependencies ?? {})
  assert(deps.length === 0, `found ${deps.length}: ${deps.join(', ')}`)
})

check('declares React as a peer dependency', () => {
  assert(installed.peerDependencies?.react, 'no react peer dependency')
})

check('ships nothing but dist', () => {
  const files = run('npm', ['pack', '--dry-run', '--json'], { cwd: ROOT })
  const entries = JSON.parse(files)[0].files.map((f) => f.path)
  const strays = entries.filter(
    (p) => !/^dist\//.test(p) && !['package.json', 'README.md', 'LICENSE'].includes(p),
  )
  assert(strays.length === 0, `unexpected: ${strays.join(', ')}`)
  assert(!entries.some((p) => /\.test\./.test(p)), 'test files leaked into the tarball')
})

check('marks css as the only side effect', () => {
  assert(JSON.stringify(installed.sideEffects) === JSON.stringify(['*.css']), 'sideEffects wrong')
})

/* -------------------------------------------------------------------------- */
/* Using it                                                                    */
/* -------------------------------------------------------------------------- */

const EXPECTED_EXPORTS = [
  'Stage',
  'useCursor',
  'useRecorder',
  'scriptToSvg',
  'scriptToPathPng',
  'PERSONALITIES',
  'validateScript',
]

check('resolves as ESM with every documented export', () => {
  writeFileSync(
    join(app, 'esm.mjs'),
    `import * as m from 'matinee'
const missing = ${JSON.stringify(EXPECTED_EXPORTS)}.filter((k) => typeof m[k] === 'undefined')
if (missing.length) { console.error('missing: ' + missing.join(', ')); process.exit(1) }
console.log('ok')
`,
  )
  const out = run('node', ['esm.mjs'], { cwd: app })
  assert(out.includes('ok'), out)
})

check('resolves as CJS with every documented export', () => {
  writeFileSync(
    join(app, 'cjs.cjs'),
    `const m = require('matinee')
const missing = ${JSON.stringify(EXPECTED_EXPORTS)}.filter((k) => typeof m[k] === 'undefined')
if (missing.length) { console.error('missing: ' + missing.join(', ')); process.exit(1) }
console.log('ok')
`,
  )
  const out = run('node', ['cjs.cjs'], { cwd: app })
  assert(out.includes('ok'), out)
})

check('exposes matinee/styles.css as a subpath', () => {
  writeFileSync(
    join(app, 'css.cjs'),
    `const p = require.resolve('matinee/styles.css')
const css = require('fs').readFileSync(p, 'utf8')
if (!css.includes('.matinee-overlay')) { console.error('css looks wrong'); process.exit(1) }
if (!/pointer-events:\\s*none/.test(css)) { console.error('overlay is not inert'); process.exit(1) }
console.log('ok')
`,
  )
  const out = run('node', ['css.cjs'], { cwd: app })
  assert(out.includes('ok'), out)
})

check('server-renders without a DOM', () => {
  writeFileSync(
    join(app, 'ssr.mjs'),
    `import { createElement as h } from 'react'
import { renderToString } from 'react-dom/server'
import { Stage } from 'matinee'
const html = renderToString(h(Stage, null, h('main', { id: 'app' }, 'Hello')))
if (!html.includes('<main id="app">Hello</main>')) { console.error('children missing'); process.exit(1) }
if (html.includes('matinee-overlay')) { console.error('overlay rendered on the server'); process.exit(1) }
console.log('ok')
`,
  )
  const out = run('node', ['ssr.mjs'], { cwd: app })
  assert(out.includes('ok'), out)
})

check('exports a usable animated SVG with no DOM at all', () => {
  writeFileSync(
    join(app, 'svg.mjs'),
    `import { scriptToSvg } from 'matinee'
const svg = scriptToSvg({
  version: 1, viewport: { w: 800, h: 400 }, seed: 3, origin: { x: 20, y: 380 },
  steps: [
    { action: 'move', point: { x: 400, y: 200 }, at: 0, duration: 600 },
    { action: 'click', point: { x: 400, y: 200 }, at: 600, duration: 300 },
  ],
})
const fail = (m) => { console.error(m); process.exit(1) }
if (!svg.startsWith('<svg')) fail('not an svg')
if (!/@keyframes mt-travel/.test(svg)) fail('no travel keyframes')
if (!/class="mt-rip"/.test(svg)) fail('no click ripple')
if (!/prefers-reduced-motion/.test(svg)) fail('no reduced-motion guard')
if (/<script/i.test(svg)) fail('contains a script tag')
if (/https?:\\/\\//.test(svg.replace(/\\sxmlns="[^"]*"/g, ''))) fail('references something external')
console.log('ok')
`,
  )
  const out = run('node', ['svg.mjs'], { cwd: app })
  assert(out.includes('ok'), out)
})

/* -------------------------------------------------------------------------- */
/* Types                                                                       */
/* -------------------------------------------------------------------------- */

check('typechecks against the shipped .d.ts', () => {
  writeFileSync(
    join(app, 'consumer.tsx'),
    `import { Stage, useCursor, useRecorder, type Script, type PersonalityName } from 'matinee'

export function App({ mood }: { mood: PersonalityName }) {
  return (
    <Stage personality={mood} label="Agent" color="#2f6bff" trail={6} scale={1} zIndex={10}
           respectReducedMotion onScriptChange={(s: Script) => void s.steps.length}>
      <Inner />
    </Stage>
  )
}

function Inner() {
  const cursor = useCursor()
  const recorder = useRecorder()
  void (async () => {
    await cursor.moveTo('#a')
    await cursor.click({ x: 1, y: 2 })
    await cursor.type('#a', 'hi')
    await cursor.scrollTo('#a')
    await cursor.hover('#a', 100)
    await cursor.pause(10)
    await cursor.say('hello', 100)
    await cursor.show()
    await cursor.hide()
    const script: Script = cursor.getScript()
    await cursor.play(script)
    const svg: string = cursor.toSvg({ background: 'transparent', width: 720, loop: true })
    const png: Blob = await cursor.toPathPng()
    void svg; void png
    await recorder.start()
    recorder.stop()
    recorder.download('demo.webm')
  })()
  return null
}
`,
  )
  writeFileSync(
    join(app, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          lib: ['ES2020', 'DOM'],
          module: 'ESNext',
          moduleResolution: 'bundler',
          jsx: 'react-jsx',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['consumer.tsx'],
      },
      null,
      2,
    ),
  )
  run('node', [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '--noEmit'], { cwd: app })
})

check('rejects a misused API at the type level', () => {
  writeFileSync(
    join(app, 'bad.tsx'),
    `import { Stage } from 'matinee'
// personality is a closed set; this must not compile.
export const Bad = () => <Stage personality="sleepy"><p /></Stage>
`,
  )
  writeFileSync(
    join(app, 'tsconfig.bad.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2020',
          lib: ['ES2020', 'DOM'],
          module: 'ESNext',
          moduleResolution: 'bundler',
          jsx: 'react-jsx',
          strict: true,
          noEmit: true,
          skipLibCheck: true,
        },
        include: ['bad.tsx'],
      },
      null,
      2,
    ),
  )
  let compiled = true
  try {
    run('node', [join(ROOT, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.bad.json'], {
      cwd: app,
    })
  } catch {
    compiled = false
  }
  assert(!compiled, 'an invalid personality compiled cleanly')
})

/* -------------------------------------------------------------------------- */

rmSync(work, { recursive: true, force: true })

console.log(`\nverifying matinee@${installed.version} as installed from a tarball\n`)
console.log(checks.join('\n'))
console.log(
  failed === 0
    ? `\n${checks.length} checks passed\n`
    : `\n${failed} of ${checks.length} checks FAILED\n`,
)
process.exit(failed === 0 ? 0 : 1)
