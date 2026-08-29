import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  root: path.resolve(__dirname, 'frontend'),
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, 'frontend/dist'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('/jspdf')) return 'pdf-vendor'
          if (id.includes('/html2canvas') || id.includes('/dompurify')) return 'html-render-vendor'
          if (id.includes('/xlsx/')) return 'spreadsheet-vendor'
          if (id.includes('/recharts/') || id.includes('/d3-')) return 'charts-vendor'
          if (id.includes('/react/') || id.includes('/react-dom/') || id.includes('/react-router')) return 'react-vendor'
          if (id.includes('/lucide-react/')) return 'icons-vendor'
          return undefined
        }
      }
    }
  },
  server: {
    host: true,
    port: 3001,
    strictPort: false,
    proxy: {
      '/api': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8081',
        changeOrigin: true
      },
      '/uploads/': {
        target: process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8081',
        changeOrigin: true
      }
    }
  }
})
