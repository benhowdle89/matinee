import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'

const here = fileURLToPath(new URL('.', import.meta.url))

/**
 * Where the demo is served from. Needed as an absolute URL because crawlers
 * will not resolve a relative og:image.
 *
 * Deliberately a constant with an env override rather than a .env file: .env
 * is in most people's global gitignore, so it never reaches CI, and the build
 * silently ships `%VITE_SITE_ORIGIN%/og.png` as the social card URL. Which is
 * exactly what happened.
 */
const SITE_ORIGIN = process.env.VITE_SITE_ORIGIN ?? 'https://matinee.pages.dev'

/**
 * Substitutes the placeholders, then refuses to emit HTML that still contains
 * one. A broken og:image is invisible until someone pastes the link somewhere.
 */
function siteOrigin(): Plugin {
  return {
    name: 'matinee-site-origin',
    enforce: 'post',
    transformIndexHtml(html) {
      const out = html.replace(/%VITE_SITE_ORIGIN%/g, SITE_ORIGIN)
      const leftover = out.match(/%[A-Z_][A-Z0-9_]*%/g)
      if (leftover) {
        throw new Error(
          `demo: unsubstituted placeholder(s) in index.html: ${[...new Set(leftover)].join(', ')}`,
        )
      }
      return out
    },
  }
}

export default defineConfig({
  root: here,
  // Cloudflare Pages serves the demo at the root of a domain; GitHub Pages
  // serves a project site under /<repo>/. Vite bakes this into every asset URL
  // at build time, so it has to be decided here rather than at request time.
  // Default to root; a subpath host sets DEMO_BASE=/matinee/.
  base: process.env.DEMO_BASE ?? '/',
  plugins: [react(), siteOrigin()],
  resolve: {
    // Array form, longest first: 'matinee/styles.css' must be matched before
    // the bare 'matinee' specifier gets a chance to swallow it.
    alias: [
      { find: 'matinee/styles.css', replacement: resolve(here, '../src/styles.css') },
      { find: 'matinee', replacement: resolve(here, '../src/index.ts') },
    ],
  },
  build: {
    outDir: resolve(here, 'dist'),
    emptyOutDir: true,
  },
})
