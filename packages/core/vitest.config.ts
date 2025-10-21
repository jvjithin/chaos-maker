import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'ChaosMaker',
      // We explicitly define the output formats and their filenames
      formats: ['es', 'umd'],
      fileName: (format) => {
        if (format === 'es') {
          // The ESM build
          return 'chaos-maker.js';
        }
        // The UMD build
        return 'chaos-maker.umd.js'; 
      },
    },
    outDir: '../extension/dist'
  },
});