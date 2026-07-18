import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: 'src/sim/t23-final-diagnostic.ts',
    target: 'node20',
    outDir: '.t23-final-dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'diagnostic.mjs',
      },
    },
  },
})
