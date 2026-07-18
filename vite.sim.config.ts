import { defineConfig } from 'vite'

export default defineConfig({
  build: {
    ssr: 'src/sim/cli.ts',
    target: 'node20',
    outDir: '.sim-dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'cli.mjs',
      },
    },
  },
})
