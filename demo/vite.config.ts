import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const here = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: here,
  // Cloudflare Pages serves the demo at the root of a domain; GitHub Pages
  // serves a project site under /<repo>/. Vite bakes this into every asset URL
  // at build time, so it has to be decided here rather than at request time.
  // Default to root; the Pages workflow sets DEMO_BASE=/matinee/.
  base: process.env.DEMO_BASE ?? '/',
  plugins: [react()],
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
