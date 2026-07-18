import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: 'src/sim/t23-search2.ts',
    target: 'node20',
    outDir: '.t23-search2-dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'search2.mjs',
      },
    },
  },
})
