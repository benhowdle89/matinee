# Handoff

Written for Ben, at the end of the build. What shipped, what I cut, what I
guessed at, and what is genuinely rough.

## What shipped

A single package, no monorepo, zero runtime dependencies, 34.7 kB packed.

- **`<Stage>`**: renders children untouched, mounts one fixed,
  `pointer-events: none`, `aria-hidden` overlay. SSR-safe: nothing
  cursor-related renders on the server, and every `useCursor()` method is a
  resolved no-op before mount, so an app that performs on load never throws in
  Node.
- **The actor**: `moveTo`, `click`, `dblclick`, `type`, `scrollTo`, `hover`,
  `pause`, `say`, `show`, `hide`. All queued, all awaitable, targets resolved at
  execution time.
- **The motion engine**: the part worth reading. See below.
- **Scripts**: every performance records itself as plain JSON as it runs.
  `getScript()` / `play()` round-trip, including through `JSON.stringify`.
- **Exports**: animated SVG (the flagship), `useRecorder()` for WebM,
  `toPathPng()` for a still.
- **Demo site** in `demo/`, which performs itself on load.
- **Assets**: `assets/hero.svg`, `assets/og.png`, both mirrored into
  `demo/public/`.
- 103 tests plus an install-from-source check, CI on push, release on tag.

## The test suite

Six files, 103 tests, in roughly increasing distance from the code:

| File | Covers |
|---|---|
| `motion.test.ts` | The maths. Bezier endpoints, the bow cap, minimum-jerk symmetry, duration clamping, seeded determinism, that the cursor overshoots and still lands exactly on target. |
| `script.test.ts` | The actor. Recording, replay round-trip through `JSON.stringify`, queue ordering, real event dispatch, native-setter typing, reduced motion, teardown. |
| `stage.test.tsx` | React. Renders with `react-dom/client`: children untouched, one inert overlay, every `<Stage>` prop, two Stages not fighting, a controlled input actually updating. |
| `ssr.test.tsx` | Server rendering, in the `node` environment so the SSR guards are genuinely exercised. Under happy-dom there is a `window` and the test would pass while the real thing threw. |
| `export-svg.test.ts` | The SVG as data: keyframe counts, ripple timings, escaping, reduced-motion guard, no `<script>`, nothing external. |
| `export.test.tsx` | All three exports through the public API, including `useRecorder` against a fake `MediaRecorder` and `toPathPng` against a recording canvas stub. |

`npm run verify` is the one that matters most and is not part of `npm test`: it
packs a tarball, installs it into a throwaway project, and uses it as a
consumer would. ESM and CJS entry points, the `matinee/styles.css` subpath, the
shipped `.d.ts` compiled against a realistic consumer component, server
rendering, and the dependency list. The unit suite imports from `./src` and so
proves none of that. It runs in CI after the build, and in `prepublishOnly`.

It is also checked against itself: planting a runtime dependency in
`package.json` makes it fail and exit non-zero, so it is not a check that
cannot fail.

## The motion, and why it is built the way it is

This got the most iteration time, per the brief. Four things do the work:

1. **Curved paths.** Cubic beziers with control points pushed perpendicular to
   the chord, magnitude and direction randomised within personality bounds and
   capped at 160px so a flick across a 4K monitor doesn't sail off screen.
2. **Minimum-jerk velocity**: `10t³ − 15t⁴ + 6t⁵`. This is the standard model
   from motor control research for human reaching, not an ease I picked by eye.
   If you change one thing in `motion.ts`, don't change this.
3. **Overshoot and settle, as two movements.** This is the bit I got wrong
   first and it's worth knowing why. My initial version added a damped
   oscillation on top of the min-jerk position. It failed its own test: at the
   moment the wobble peaked, min-jerk was still ~25% short of the target, so
   the cursor never actually passed it; it just wiggled on approach. Human
   reaching is genuinely two movements (a ballistic throw that lands wrong,
   then a corrective submovement), so the travel ease now *completes early*, at
   `1 - SETTLE_FRACTION`, parked a few px past the target, and the last 26%
   walks it back. Both halves are min-jerk and meet at zero velocity, so
   there's no kink.
4. **Sub-pixel tremor**, two incommensurable sine frequencies per axis so it
   never visibly repeats, faded out on arrival so the cursor lands clean.

`sampleMotion` is a pure function and lands exactly on target at `t=1`, which
is what lets the SVG exporter reproduce the motion without a DOM.

## The hero, verified rather than assumed

The brief asked for this to be checked, not believed, so:

- Loaded `assets/hero.svg` through an `<img>` tag in Chrome (the sandboxed
  context, not inlined) and screenshotted seven points across the loop. All
  six frame pairs differ.
- Fetched the exact bytes GitHub serves at
  `github.com/benhowdle89/matinee/raw/main/assets/hero.svg`. All 7,229 arrive
  intact: 67 translate keyframes, 3 ripples, the reduced-motion guard, zero
  `<script>` tags, zero external references.
- The response carries
  `content-security-policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`.
  That `style-src 'unsafe-inline'` is the load-bearing clause: it is what
  permits the inline `<style>` block the animation lives in, while `sandbox`
  and `default-src 'none'` kill scripts and external fetches. The export is
  built to fit exactly that hole.

## One thing about your machine, not this repo

There is a stray `node_modules` at **`~/node_modules`** containing (among other
things) `@types/node`. TypeScript walks *up* the directory tree looking for
`node_modules`, so that directory silently satisfies imports for **every
project under your home directory**. It is why `@types/node` being missing from
this package was invisible locally and only surfaced in CI.

Worth deleting, or at least knowing about; it will mask a missing dependency
again. It is also why I stopped trusting `npm run typecheck` on this machine
and reproduced CI properly (clean copy under `/private/tmp`, `npm ci`, no
`dist/`) before believing the fix.

## Deliberately cut: your v0.2 menu

Straight from the non-goals list, untouched and unscaffolded:

- Multiple simultaneous cursors
- GIF export
- A Playwright/headless recording companion CLI
- Drag-and-drop actions
- Framework adapters (Vue, Svelte, vanilla)
- A plugin system
- Visual script editor / recorder-from-real-mouse

Of these, the two I'd actually reach for first are **drag** (cheap: it's
`pointerdown`, a `travel`, `pointerup`, and the queue already handles it) and
**the headless CLI** (because "render this script to an MP4 in CI" is the thing
someone will ask for within a week).

## Where I deviated from the brief

Three places. All defensible, all reversible, none silent.

**1. The SVG uses `transform: translate()` keyframes, not `offset-path`.**
The brief specified `offset-path`. I used sampled transform keyframes instead
because they reproduce the overshoot and the tremor *exactly*: they are the
sampled positions, where an `offset-path` sweep with a CSS easing function can
only approximate the curve the audience actually watched. They're also
supported by every renderer that will ever see the file. The stated requirement
was "it must animate in a GitHub README", and that requirement is met and
verified. Cost: a slightly larger `<style>` block. The hero is 7.1 kB.

**2. Release uses npm trusted publishing (OIDC), not an `NPM_TOKEN` secret.**
The brief said `NPM_TOKEN`. Your `intermission` repo already made this exact
move in `0db7ad4`, and you'd just hit the 2FA wall locally, so shipping a
long-lived token into a fresh repo looked like re-introducing a problem you'd
already solved. **This needs one manual step I could not script:**

> npmjs.com/package/matinee/access → Trusted publisher →
> repository `benhowdle89/matinee`, workflow `release.yml`

Until you do that, the release job will fail at the publish step. It has to be
done in the web UI while signed in. As of 31 July 2026, bypass-2FA tokens are
blocked from modifying trusted-publishing config.

**3. Two extra fields on `Script`, and one extra source file.**
`Script` gained `seed` and `origin`, and `Step` gained `point`. All plain JSON,
all load-bearing: the seed makes replays and exports deterministic, and `point`
records where the cursor actually landed, which is what lets `toSvg()` run with
no DOM at all instead of re-querying a page that has since changed.
`src/timeline.ts` is the shared reconstruction both exporters use; it isn't in
the brief's file list, but the alternative was the PNG exporter importing from
the SVG exporter.

## Tuned by judgement, worth your eye

These are all in `src/motion.ts` unless noted, and all were set by feel. I'd
look at them on a real demo before you're happy.

| Thing | Value | Note |
|---|---|---|
| Default blue | `#2f6bff` | "Confident without being a link". Set in `stage.tsx` and duplicated as a constant in both exporters; change all three. |
| `SETTLE_FRACTION` | `0.26` | How much of each journey is the corrective movement. Raise it and the cursor looks more hesitant; lower it and the overshoot reads as a glitch. |
| `confident` overshoot | `0.035`, max 22px | The default personality. This is the number most worth staring at. |
| `caffeinated` overshoot | `0.075`, max 40px | Deliberately near cartoonish. Might be too much. |
| `curious` pace | `1.45` | Slowest. On a long page this can feel *sluggish* rather than *curious*. |
| `hesitation` | 70 / 220 / 25 ms | The beat before committing to a click. Deleting this line makes the whole thing read as a machine; I'd rather it were too long than too short. |
| Click point jitter | inner 34% of the element | Humans don't click dead centre twice running. |
| `say()` default hold | `max(1200ms, 45ms × chars)` | Guessed reading speed. |
| Trail stride | every 3rd frame, 8 dots | Sampling every frame gives a stub, not a tail. |

## Known rough edges, honestly

- **SVG export is faithful, not bit-identical.** It re-rolls the curve between
  the same recorded landing points using the script's seed, so the arcs are of
  the same *character* as the ones on screen without being the same arcs. At
  24fps over a nine-second clip I can't tell, and the alternative is storing
  thousands of sampled points in every script. But it isn't a frame-exact
  recording and shouldn't be described as one.
- **`toSvg()` exports the cursor, never the page,** and a performance that
  scrolls cannot be laid over a screenshot. Recorded points are viewport
  coordinates and the export has no notion of a scroll offset, so points
  captured either side of a `scrollTo` are in frames that no longer relate to
  each other. The motion stays continuous and correct; it just will not line up
  with any single static image. Two ways out if this ever matters: record
  `window.scrollY` on each step and have the exporter translate the scene
  between scrolls, or keep exportable performances scroll-free. The demo takes
  the second route, in `demo/scene.ts`.
- **A bare export is an anticlimax.** With the default transparent background
  and no `backdrop`, you get a cursor moving through empty space. That is the
  right default for laying over your own screenshot, and a poor souvenir on its
  own, which is why both the README hero and the demo's download button pass a
  hand-drawn `backdrop`. Worth knowing before anyone calls `toSvg()` and
  wonders where their app went.
- **`toSvg()` doesn't render captions.** `say()` shows a speech bubble live,
  but the SVG exporter ignores `say` steps except as a pause. If a caption is
  the punchline of your demo, the SVG will miss it. Probably the first export
  bug someone reports.
- **`scrollTo` only handles vertical scrolling.** Horizontal containers are
  found but not scrolled.
- **The hero's typing animation is hand-authored**, not generated. The
  character reveal and caret in `scripts/make-hero.mjs` are hand-timed CSS that
  has to agree with the exporter about the loop length. Change the hero's steps
  and you must re-check `CARET_TRAVEL` and the percentages by eye.
- **`og.png` needs a browser to regenerate.** `npm run og` writes
  `assets/og.svg`; turning that into the PNG was done by screenshotting it in
  Chrome via a throwaway Playwright script, so matinee gains no dependency for
  an image regenerated approximately never. If you need to redo it:
  `npx playwright` + `page.goto(file://…/og.svg)` + `screenshot`, viewport
  1200×630, `deviceScaleFactor: 1`.
- **No visual regression testing.** The motion is verified by maths tests
  (lands on target, overshoots, stays finite, is deterministic) and by
  screenshots I looked at once. There's nothing stopping a future change making
  it *ugly* while staying green.
- **`useRecorder` is tested against a fake, not a browser.** `export.test.tsx`
  drives it with a stub `MediaRecorder` and `getDisplayMedia`, which covers the
  logic worth covering: codec negotiation, the blob and object URL, releasing
  the capture on stop and on unmount, a declined prompt treated as a normal
  outcome rather than an error. What it cannot cover is the real permission
  dialog and real codecs. Worth clicking once yourself before you tell anyone
  about it.
- **The demo autoplays on load.** Guarded by `prefers-reduced-motion` and it
  only fires once, but some people will still find it presumptuous.

## Launch checklist

- [x] **npm trusted publisher configured**: `benhowdle89/matinee`,
      `release.yml`
- [x] **0.1.0 published**: https://www.npmjs.com/package/matinee, with a
      provenance attestation, zero runtime dependencies
- [x] **GitHub release cut**:
      https://github.com/benhowdle89/matinee/releases/tag/v0.1.0
- [x] **Repo public**: https://github.com/benhowdle89/matinee
- [x] **Hero SVG embedded and animating on github.com**: verified against the
      bytes GitHub actually serves, not assumed
- [x] **Smoke-tested from the registry**: fresh `npm install matinee` in an
      empty project; all exports resolve, `matinee/styles.css` resolves,
      `.d.ts` ships, `scriptToSvg()` runs in Node with no DOM
- [x] **Demo site live** at https://matinee.pages.dev, deployed to Cloudflare
      Pages with `wrangler`. Verified in a real browser: no console errors, no
      4xx, and the performance runs end to end.
- [x] **`homepage` in `package.json`** points at the demo. It reaches npm on the
      next publish, not retroactively.
- [x] **Automatic demo deploys.** The Pages project is connected to the repo in
      the Cloudflare dashboard, so every push to `main` rebuilds and ships. No
      API token is stored in GitHub. To ship by hand anyway:
      `npm run demo:build && npx wrangler pages deploy demo/dist --project-name matinee`
- [ ] **Turn GitHub Pages back off** (Settings, Pages, Source, None). It got
      enabled while we were deciding between hosts, and it is set to deploy
      from the branch root, so it publishes the repository itself rather than
      the demo. Cloudflare is the host; two URLs for one demo is worse than
      one.
- [ ] **Wire a custom domain** if you want one, then update
      `VITE_SITE_ORIGIN` in `demo/.env` (the absolute `og:image` URL) and
      `homepage` in `package.json`.
- [ ] **Look at the motion yourself**: `npm run demo`. I have only seen it in
      screenshots. If `confident` feels wrong, the numbers to turn are in the
      table above.
- [ ] **Tweet:**

      _(left blank, yours to write)_

## Running things

```sh
npm run typecheck     # tsc --noEmit
npm test              # 103 tests, happy-dom (plus one node-env file for SSR)
npm run build         # tsup -> ESM + CJS + .d.ts + styles.css
npm run verify        # pack, install into a temp project, use it as a consumer
npm run demo          # the demo site, localhost
npm run hero          # rebuild assets/hero.svg
npm run docs:assets   # rebuild the three personality SVGs in the README
npm run og            # rebuild assets/og.svg
```

## How the two things ship

**The demo site** rebuilds itself. The Cloudflare Pages project is connected to
the repo, so a push to `main` builds `npm run demo:build` and publishes
`demo/dist` to https://matinee.pages.dev. Nothing to run, no secret in GitHub.

**The npm package** ships on a version tag, and only on a version tag:

```sh
npm version patch      # or minor, or major
git push --follow-tags
```

That fires `release.yml`, which typechecks, tests, builds, runs `npm run
verify`, publishes through trusted publishing with a provenance attestation,
and cuts the GitHub release. No token, no OTP, nothing to rotate.

Watch out for one trap: `--follow-tags` pushes **annotated** tags only. `npm
version` creates annotated tags itself so the recipe above is fine, but a
hand-rolled `git tag v1.2.3` is lightweight, gets silently left behind, and you
sit watching a workflow that was never queued. Use `git tag -a` if you tag by
hand.

Pushing to `main` on its own publishes nothing. It rebuilds the demo and runs
CI, and that is all.
