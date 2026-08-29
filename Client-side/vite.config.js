import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config for the React DOCX Editor sample.
// Notable choices:
//   * The Syncfusion EJ2 packages ship a mix of ESM and CommonJS. We pre-bundle
//     the most commonly used ones via `optimizeDeps.include` so dev start is fast
//     and HMR works correctly.
//   * We expose `process.env` because some Syncfusion bundles still reference it.
//   * The dev server proxies `/api/*` to the local .NET backend on :62870 so the
//     client can use a relative serviceUrl during development.
//   * We use the Rollup `splitVendorChunk`-style manualChunks to keep the document
//     editor (a very large dependency) in its own chunk.
export default defineConfig({
  plugins: [react()],
  define: {
    'process.env': {},
  },
  resolve: {
    alias: {
      // Allow `@/...` imports if anyone uses them; harmless if not.
      '@': '/src',
    },
  },
  server: {
    port: 3000,
    open: true,
    proxy: {
      '/api': {
        target: 'http://localhost:62870',
        changeOrigin: true,
        secure: false,
      },
    },
  },
  preview: {
    port: 3000,
  },
  build: {
    outDir: 'build',
    sourcemap: false,
    // Syncfusion's Document Editor and its React wrapper are tightly coupled
    // (one re-exports the other), so we keep them in a single vendor chunk.
    // Bump the warning limit so the chunk-size message is suppressed.
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('@syncfusion/')) {
            return 'vendor-syncfusion';
          }
          return undefined;
        },
      },
    },
  },
  optimizeDeps: {
    include: [
      'react',
      'react-dom',
      '@syncfusion/ej2-base',
      '@syncfusion/ej2-react-buttons',
      '@syncfusion/ej2-react-inputs',
      '@syncfusion/ej2-react-popups',
      '@syncfusion/ej2-react-lists',
      '@syncfusion/ej2-react-documenteditor',
      '@syncfusion/ej2-react-interactive-chat',
    ],
  },
});
