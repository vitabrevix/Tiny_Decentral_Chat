import { defineConfig } from 'vite'

export default defineConfig({
  base: '/Tiny_Decentral_Chat/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: 'index.html',
      }
    }
  },
  define: {
    global: 'globalThis',
  },
  optimizeDeps: {
    include: ['gun', 'yjs', 'y-webrtc']
  }
})
