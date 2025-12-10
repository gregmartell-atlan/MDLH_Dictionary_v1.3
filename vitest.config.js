import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    include: ['src/**/*.{test,spec}.{js,jsx,ts,tsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      // Only track coverage for files with corresponding tests
      include: [
        'src/utils/resultFormatters.js',
        'src/utils/discoveryQueries.js',
        'src/components/EmptyResultsState.jsx',
      ],
      exclude: [
        'src/test/**',
        'src/**/*.test.{js,jsx}',
        'src/**/*.spec.{js,jsx}',
        'src/main.jsx',
      ],
      thresholds: {
        lines: 85,
        branches: 70,
        functions: 85,
        statements: 85,
      },
    },
  },
});

