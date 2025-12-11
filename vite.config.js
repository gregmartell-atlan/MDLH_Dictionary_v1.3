import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // For GitHub Pages deployment
  base: '/MDLH_Dictionary_v1.3/',

  // Build optimizations
  build: {
    // Enable source maps for debugging in production (optional)
    sourcemap: false,

    // Manual chunk splitting - reduces initial bundle size
    rollupOptions: {
      output: {
        manualChunks: {
          // React core - loaded by everything
          'vendor-react': ['react', 'react-dom'],

          // Table components - TanStack Table + Virtual
          'vendor-table': ['@tanstack/react-table', '@tanstack/react-virtual'],

          // Icons - lucide-react is large, chunk it separately
          'vendor-icons': ['lucide-react'],
        },
      },
    },

    // Target modern browsers for smaller output
    target: 'es2020',

    // Chunk size warnings (in KB)
    chunkSizeWarningLimit: 500,
  },

  // Dev server optimizations
  server: {
    // Pre-warm frequently used files for faster HMR
    warmup: {
      clientFiles: [
        './src/App.jsx',
        './src/hooks/useSnowflake.js',
        './src/components/QueryEditor.jsx',
      ],
    },
  },

  // Optimize dependency pre-bundling
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@tanstack/react-table',
      '@tanstack/react-virtual',
      'lucide-react',
    ],
  },
})

