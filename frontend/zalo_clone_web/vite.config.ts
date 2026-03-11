import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    tailwindcss(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': [
            'react',
            'react-dom',
            'react-router-dom',
          ],
          'vendor-antd': [
            'antd',
            '@ant-design/icons',
          ],
          'vendor-tanstack': [
            '@tanstack/react-query',
          ],
          'vendor-firebase': [
            'firebase/app',
            'firebase/messaging',
          ],
          'vendor-socketio': [
            'socket.io-client',
          ],
        },
      },
    },
  },
})
