import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: 'src/sim/t23-search.ts',
    target: 'node20',
    outDir: '.t23-search-dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'search.mjs',
      },
    },
  },
})
