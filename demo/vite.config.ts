import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const here = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: here,
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
