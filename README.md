<div align="center">

<img src="assets/hero.svg" alt="A cursor moving across a wireframe interface, clicking a button and typing into a field" width="720">

# matinee

**Staged cursor performances for React.**

[![npm](https://img.shields.io/npm/v/matinee?color=2f6bff&label=npm)](https://www.npmjs.com/package/matinee)
[![CI](https://github.com/benhowdle89/matinee/actions/workflows/ci.yml/badge.svg)](https://github.com/benhowdle89/matinee/actions/workflows/ci.yml)

</div>

Every AI product demo shows a cursor using software. Almost all of them are faked by hand in After Effects, and they have to be redone every time the UI changes.

matinee is a ghost cursor you can programme. You write a script; an actor performs it against your real app (moving, clicking, typing, scrolling) with motion that reads as a hand rather than a tween. Then it exports itself as an animated SVG you can drop straight into a README.

```sh
npm install matinee
```

## Curtain up

Two lines:

```tsx
import { Stage } from 'matinee'
import 'matinee/styles.css'

<Stage>
  <YourApp />
</Stage>
```

Then direct the performance from anywhere inside:

```tsx
import { useCursor } from 'matinee'

function Demo() {
  const cursor = useCursor()

  useEffect(() => {
    async function perform() {
      await cursor.moveTo('#search')
      await cursor.type('#search', 'invoices from March')
      await cursor.pause(600)
      await cursor.click('#submit')
      await cursor.say('and there it is')
    }
    perform()
  }, [cursor])

  return <YourApp />
}
```

Every method returns a promise that resolves when the motion finishes, and queues if you call it while something else is running, so `await` is optional and the order is always the order you wrote.

## Why the motion looks right

This is the part everything else rests on, so it is worth being specific about.

- **Curved paths.** Every journey is a cubic bezier whose control points are pushed perpendicular to the straight line, randomised within the personality's bounds. Two trips between the same two buttons never trace the same arc.
- **Minimum-jerk velocity.** The easing is `10t³ − 15t⁴ + 6t⁵`, the standard model from motor control research for how a human arm moves between two points. It was not picked by eye.
- **Overshoot and settle.** Human reaching is two movements, not one: a fast ballistic throw that lands slightly wrong, then a small corrective submovement. matinee models both. A single smooth arrival is the tell that gives away every tweened cursor.
- **A tremor underneath.** Sub-pixel, never repeating, fading out as the cursor settles.

## The actor

```ts
const cursor = useCursor()
```

| Method | What it does |
|---|---|
| `moveTo(target)` | Travels there |
| `click(target?)` | Moves there if given a target, then dispatches real `pointerdown`/`pointerup`/`click` |
| `dblclick(target?)` | As above, twice, then `dblclick` |
| `type(target, text)` | Focuses, then types with human cadence |
| `scrollTo(target)` | Smooth-scrolls the page or nearest scrollable container to bring it into view |
| `hover(target, ms?)` | Moves there and rests |
| `pause(ms?)` | Idle drift and a thinking pulse |
| `say(text, ms?)` | Speech bubble beside the cursor |
| `show()` / `hide()` | Fades in and out |
| `getScript()` / `play(script)` | The performance as data, and back again |
| `toSvg()` / `toPathPng()` | Exports |

A **target** is a CSS selector, an `Element`, a ref, or `{ x, y }`. Selectors resolve at execution time, not call time. By the time a queued click runs, the page has usually moved on.

Clicks dispatch real events on the real element, so your app responds exactly as it would to a hand. Typing goes through the prototype value setter, which is what makes React-controlled inputs actually update instead of silently ignoring it.

## The stage

| Prop | Type | Default | |
|---|---|---|---|
| `label` | `string \| false` | `"Agent"` | Nameplate riding with the cursor |
| `color` | `string` | `#2f6bff` | Nameplate, ripple and trail accent |
| `cursor` | `"pointer" \| "hand" \| ReactNode` | `"pointer"` | |
| `personality` | `"confident" \| "curious" \| "caffeinated"` | `"confident"` | Speed, curvature, overshoot, idle drift |
| `trail` | `boolean \| number` | `false` | Fading motion trail; a number sets the length |
| `scale` | `number` | `1` | |
| `zIndex` | `number` | `9999` | |
| `respectReducedMotion` | `boolean` | `true` | Jump-cuts instead of animating under `prefers-reduced-motion` |
| `onScriptChange` | `(script: Script) => void` |  | Fires as the performance is recorded |

`<Stage>` renders its children untouched and mounts one fixed, `pointer-events: none`, `aria-hidden` overlay beside them. It never affects layout, never intercepts a click, and renders nothing cursor-related on the server.

## Personalities

|  | confident | curious | caffeinated |
|---|---|---|---|
| speed | brisk | slower, wanders | fast |
| curvature | low | high | medium |
| overshoot | slight | minimal | pronounced |
| idle drift | minimal | noticeable | jittery |

## Exports

### Animated SVG: the one that matters

```ts
const svg = cursor.toSvg({ background: 'transparent', width: 720 })
```

**This animates inside a GitHub README.** That is the whole trick, and it is why the hero at the top of this page moves. The file is entirely self-contained. The keyframes, the glyph, the nameplate and the colour are all inline, there is no `<script>` tag and no external reference of any kind, because that is precisely the shape GitHub's image sandbox will render.

Drop it in with plain markdown:

```md
<img src="assets/hero.svg" width="720">
```

Transparent by default, so it sits on top of a screenshot. `{ loop: false }` if you want it to play once. The animation is wrapped in `@media (prefers-reduced-motion: no-preference)`, so a reader who has asked for less motion gets a composed still instead.

### Video

```tsx
const recorder = useRecorder()

<button onClick={recorder.start}>Record</button>
<button onClick={recorder.stop}>Stop</button>
<button onClick={() => recorder.download('demo.webm')}>Download</button>
```

Honestly: this wraps `getDisplayMedia` and `MediaRecorder`, so it records the real tab and it costs one browser permission prompt. There is no way around the prompt, and there shouldn't be: a page should not be able to capture itself unasked. matinee does not attempt to render the DOM to a canvas; that road produces something subtly wrong for every non-trivial page.

### Path PNG

```ts
const blob = await cursor.toPathPng()
```

A still of the journey with a marker at every click, on transparency.

## Scripts

Every performance records itself as plain data while it runs:

```ts
const script = cursor.getScript()
// { version: 1, viewport: {...}, seed, origin, steps: [...] }

await cursor.play(script)
```

It is JSON all the way down (no functions, no element references), so you can store it, post it, diff it in review, or replay it in a different session. Selector targets are stored as selectors so they survive rerenders; point targets are rescaled if the script is replayed on a different viewport.

## Accessibility

The overlay is `aria-hidden` and `pointer-events: none`, always. `respectReducedMotion` is honoured everywhere, including inside the exported SVG. Multiple `<Stage>`s on one page do not fight: each owns its own actor and its own overlay, and nothing is leaked to a global.

## Not to be confused with

- **[ghost-cursor](https://github.com/Xetera/ghost-cursor)**: human-like mouse movement for Puppeteer, built for bot evasion. matinee stages performances; it isn't a disguise.
- **[Screen Studio](https://screen.studio)**: records your real screen beautifully. matinee performs your app instead of filming it, which means it re-renders when the UI changes.
- **[rrweb](https://github.com/rrweb-io/rrweb)**: records and replays real user sessions. matinee's scripts are written, not captured.

## Requirements

React ≥18. Zero runtime dependencies.

## License

MIT © [Ben Howdle](https://benji.org)
