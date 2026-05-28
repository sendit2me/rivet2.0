import { defineConfig, splitVendorChunkPlugin } from 'vite';
import type { PluginOption } from 'vite';
import react from '@vitejs/plugin-react';
import viteTsconfigPaths from 'vite-tsconfig-paths';
import svgr from 'vite-plugin-svgr';
import monacoEditorPlugin from 'vite-plugin-monaco-editor';
import topLevelAwait from 'vite-plugin-top-level-await';
import { resolve } from 'node:path';
import { visualizer } from 'rollup-plugin-visualizer';

const analyzeBundle = process.env.RIVET_BUNDLE_ANALYZE === 'true';

const reactDevTools = (): PluginOption => {
  return {
    name: 'react-devtools',
    apply: 'serve', // Only apply this plugin during development
    transformIndexHtml(html) {
      return {
        html,
        tags: [
          {
            tag: 'script',
            attrs: {
              src: 'http://localhost:8097',
            },
            injectTo: 'head',
          },
        ],
      };
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig({
  optimizeDeps: {
    exclude: ['@valerypopoff/rivet2-core', '@valerypopoff/trivet'],
  },
  resolve: {
    preserveSymlinks: true,

    alias: {
      '@valerypopoff/rivet2-core': resolve('../core/src/index.ts'),
      '@valerypopoff/trivet': resolve('../trivet/src/index.ts'),
      '@google-cloud/vertexai': resolve('./src/utils/browser/vertexAiBrowserStub.ts'),
    },
  },
  build: {
    chunkSizeWarningLimit: 10000,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('commonjsHelpers')) {
            return 'vendor';
          }

          if (id.includes('gpt-tokenizer')) {
            return 'gpt-tokenizer';
          }
        },
      },
      plugins: analyzeBundle ? [visualizer()] : [],
    },
  },
  plugins: [
    reactDevTools(),
    react(),
    viteTsconfigPaths(),
    svgr({
      svgrOptions: {
        icon: true,
      },
    }),
    // Bad ESM
    (monacoEditorPlugin as any).default({}),
    topLevelAwait(),
    splitVendorChunkPlugin(),
  ],
  worker: {
    format: 'es',
  },
});
