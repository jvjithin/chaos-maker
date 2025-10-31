import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'ChaosMaker',
    },
    rollupOptions: {
      output: [
        {
          format: 'es',
          entryFileNames: 'chaos-maker.js',
          dir: './dist',
        },
        {
          format: 'umd',
          name: 'ChaosMaker', 
          entryFileNames: 'chaos-maker.umd.js',
          dir: './dist',
        },
      ],
    },
    outDir: './dist',
    emptyOutDir: true, 
  },
});