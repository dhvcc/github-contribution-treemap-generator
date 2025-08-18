import { defineConfig } from 'tsup';
import fs from 'node:fs';
import path from 'node:path';

export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: ['esm'],
  dts: true,
  splitting: false,
  sourcemap: true,
  clean: true,
  minify: false,
  target: 'node18',
  outDir: 'dist',
  external: ['d3-hierarchy'],
  define: {
    __VERSION__: JSON.stringify(
      JSON.parse(fs.readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')).version
    ),
  },
});
