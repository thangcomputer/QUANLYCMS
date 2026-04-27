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
        // Tách vendor libraries thành các chunk riêng biệt để browser cache tốt hơn
        manualChunks: {
          // React core — ít thay đổi, cache lâu dài
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          // UI libraries
          'vendor-ui': ['lucide-react'],
          // Socket.io client
          'vendor-socket': ['socket.io-client'],
          // Chart / analytics (nếu có)
          'vendor-chart': ['recharts'],
        },
      },
    },
  },
})

