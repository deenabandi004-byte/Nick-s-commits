import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const NGROK_HOST = env.NGROK_HOST || '' // e.g. 2f8651b5bfbe.ngrok-free.app
  const allowed = ['localhost', '127.0.0.1', '.ngrok-free.app']
  if (NGROK_HOST) allowed.push(NGROK_HOST)

  return {
    plugins: [react()],
    base: '/',                      // ✅ ensure asset URLs resolve at root
    resolve: {
      alias: { '@': path.resolve(__dirname, './src') },
      // Ensure React is deduplicated
      dedupe: ['react', 'react-dom'],
    },
    optimizeDeps: {
      // Pre-bundle React to avoid multiple instances
      include: ['react', 'react-dom'],
      // Ensure React is properly resolved
      esbuildOptions: {
        target: 'esnext',
      },
    },
    build: { 
      outDir: 'dist', 
      assetsDir: 'assets',
      // Production-specific optimizations
      minify: 'esbuild', // Use esbuild (faster, more reliable than terser)
      sourcemap: false, // Disable sourcemaps in production to reduce size
      // ✅ Optimize chunk splitting to reduce number of concurrent requests
      rollupOptions: {
        // Don't preserve entry signatures in production - let Rollup optimize
        // This prevents "Cannot access before initialization" errors
        preserveEntrySignatures: false,
        output: {
          // Strategy: Create fewer, larger chunks to reduce concurrent requests
          // while ensuring proper initialization order
          manualChunks: (id) => {
            // Group all node_modules into vendor chunk
            if (id.includes('node_modules')) {
              // Route-level animation/chart chunks. These are React-dependent
              // but only reached from a handful of routes (framer-motion: find/
              // promo/landing-animated surfaces; recharts: chart.tsx), so we
              // keep them OUT of vendor-react to slim the critical path. They
              // still import React from vendor-react, so ES module ordering
              // guarantees vendor-react evaluates first (no init-order risk).
              // NOTE: recharts is currently tree-shaken out (chart.tsx unused),
              // so vendor-charts produces no chunk today — the rule exists so a
              // future chart usage is route-split instead of bloating vendor-react.
              if (id.includes('framer-motion')) {
                return 'vendor-framer';
              }
              if (id.includes('recharts')) {
                return 'vendor-charts';
              }
              // CRITICAL: React and React-DOM must be in the same chunk as ALL libraries that use React
              // This prevents "Cannot access 'z' before initialization" and "useLayoutEffect" errors
              // Put React and ALL React-dependent libraries together
              // BE AGGRESSIVE: If there's any doubt, put it in vendor-react
              if (id.includes('react') ||
                  id.includes('react-dom') ||
                  id.includes('@radix-ui') ||
                  id.includes('react-router') ||
                  id.includes('react-hook-form') ||
                  id.includes('@tanstack/react-query') ||
                  id.includes('react-day-picker') ||
                  id.includes('embla-carousel-react') ||
                  id.includes('react-resizable-panels') ||
                  id.includes('react-fast-marquee') ||
                  id.includes('react-is') ||
                  id.includes('@hookform/resolvers') || // Uses React
                  id.includes('cmdk') || // Uses React
                  id.includes('sonner') || // Uses React
                  id.includes('vaul') || // Uses React
                  id.includes('input-otp') || // Uses React
                  id.includes('next-themes') || // Uses React
                  id.includes('lucide-react') || // Uses React
                  id.includes('zod')) { // Might have React peer deps, safer to include
                return 'vendor-react';
              }
              // Separate Firebase into its own chunk (large library, confirmed no React)
              if (id.includes('firebase')) {
                return 'vendor-firebase';
              }
              // Group utility libraries that are CONFIRMED to not use React
              // Only pure utility functions with no dependencies
              if (id.includes('clsx') || 
                  id.includes('tailwind-merge') ||
                  id.includes('class-variance-authority')) {
                return 'vendor-utils';
              }
              // Date utilities (confirmed no React)
              if (id.includes('date-fns')) {
                return 'vendor-dates';
              }
              // Stripe (confirmed no React)
              if (id.includes('@stripe')) {
                return 'vendor-stripe';
              }
              // If we're not sure, put it with React to be safe
              // This prevents "useLayoutEffect" errors from libraries we didn't catch
              return 'vendor-react';
            }
          },
          // Ensure proper module format to prevent initialization issues
          format: 'es',
          // Prevent hoisting transitive imports which can cause initialization order issues
          hoistTransitiveImports: false,
          // Ensure proper chunk loading order
          generatedCode: {
            constBindings: true, // Use const instead of var to prevent hoisting issues
          },
        },
      },
      // Optimize chunk size limits
      chunkSizeWarningLimit: 1000,
      // Ensure React is properly deduplicated
      commonjsOptions: {
        include: [/node_modules/],
        transformMixedEsModules: true,
      },
    },
    server: {
      host: true,
      port: 8080,
      allowedHosts: true,
      hmr: NGROK_HOST ? { protocol: 'wss', host: NGROK_HOST, clientPort: 443 } : undefined,
    },
  }
})
