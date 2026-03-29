import { defineConfig } from 'vite';
import { resolve } from 'path';
import { copyFileSync, mkdirSync } from 'fs';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'ChaosMaker',
      formats: ['es', 'umd'],
      fileName: (format) => format === 'es' ? 'chaos-maker.js' : 'chaos-maker.umd.js',
    },
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [
    {
      name: 'copy-to-extension',
      closeBundle() {
        const extDist = resolve(__dirname, '../extension/dist');
        mkdirSync(extDist, { recursive: true });
        copyFileSync(
          resolve(__dirname, 'dist/chaos-maker.umd.js'),
          resolve(extDist, 'chaos-maker.umd.js')
        );
        copyFileSync(
          resolve(__dirname, 'dist/chaos-maker.js'),
          resolve(extDist, 'chaos-maker.js')
        );
      },
    },
  ],
});