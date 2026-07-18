import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: 'src/sim/t23-diagnostic.ts',
    target: 'node20',
    outDir: '.t23-dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'diagnostic.mjs',
      },
    },
  },
})
