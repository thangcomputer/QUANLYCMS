import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    exclude: ['@tensorflow-models/face-detection', '@mediapipe/face_detection']
  },
  build: {
    // Tăng giới hạn chunk cảnh báo
    chunkSizeWarningLimit: 1000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react') || id.includes('react-dom') || id.includes('react-router-dom')) {
              return 'vendor-react';
            }
            if (id.includes('lucide-react')) {
              return 'vendor-ui';
            }
            if (id.includes('socket.io-client')) {
              return 'vendor-socket';
            }
            if (id.includes('recharts')) {
              return 'vendor-chart';
            }
            return 'vendor'; // tất cả các dependencies khác
          }
        }
      },
    },
  },
})

