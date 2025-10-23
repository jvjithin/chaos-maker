import { defineConfig } from 'vite';

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    lib: {
      // We only define the entry and global name here
      entry: 'src/index.ts',
      name: 'ChaosMaker',
    },
    rollupOptions: {
      // We explicitly define our two output formats as an array
      output: [
        {
          // This is the ES Module build
          format: 'es',
          entryFileNames: 'chaos-maker.js',
          dir: './dist',
        },
        {
          // This is the UMD build
          format: 'umd',
          // UMD builds must have a 'name'
          name: 'ChaosMaker', 
          entryFileNames: 'chaos-maker.umd.js',
          dir: './dist',
        },
      ],
    },
    // Build to core's own dist directory
    outDir: './dist',
    emptyOutDir: true, 
  },
});