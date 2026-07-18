import { defineConfig } from 'vite'

export default defineConfig({
  ssr: {
    noExternal: true,
  },
  build: {
    ssr: 'src/sim/t23-probe.ts',
    target: 'node20',
    outDir: '.t23-probe-dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: 'probe.mjs',
      },
    },
  },
})
