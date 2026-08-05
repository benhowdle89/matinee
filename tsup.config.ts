import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  treeshake: true,
  // React is a peer dependency and must never be bundled: two copies of React
  // in one page is a broken-hooks bug that surfaces a long way from its cause.
  external: ['react', 'react-dom'],
  // styles.css is a separate export rather than an import inside the JS, so
  // nothing bundles it for us. Copy it verbatim.
  onSuccess: 'cp src/styles.css dist/styles.css',
})
