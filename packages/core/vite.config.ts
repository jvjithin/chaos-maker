import { defineConfig } from 'vite';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ChaosMaker',
    },
    rollupOptions: {
      output: [
        {
          format: 'es',
          entryFileNames: 'chaos-maker.js',
          dir: 'dist',
        },
        {
          format: 'cjs',
          entryFileNames: 'chaos-maker.cjs',
          dir: 'dist',
        },
        {
          format: 'umd',
          name: 'ChaosMaker',
          entryFileNames: 'chaos-maker.umd.js',
          dir: 'dist',
        },
      ],
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
});