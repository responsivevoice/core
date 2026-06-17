import { readFileSync } from 'node:fs';
import babel from '@rollup/plugin-babel';
import { defineConfig } from 'tsdown';
import { bannerFor } from './banner.ts';

const { version } = JSON.parse(readFileSync('./package.json', 'utf8'));
const banner = bannerFor(import.meta.url);
const define = { __RV_CORE_VERSION__: JSON.stringify(version) };

export default defineConfig([
  // ESM + CJS bundles
  {
    entry: ['src/index.ts'],
    format: ['cjs', 'esm'],
    target: 'node16',
    dts: true,
    clean: true,
    sourcemap: true,
    treeshake: true,
    minify: false,
    outDir: 'dist',
    banner,
    define,
    // CJS is intentional — consumers need both formats
    checks: { legacyCjs: false },
    // index.ts has both named + default exports by design
    outputOptions: (options) => {
      options.exports = 'named';
      return options;
    },
  },
  // IIFE bundle for script tag usage (auto-creates instance on window.responsiveVoice)
  // Targets legacy browsers (Chrome 66+, Firefox 57+, Safari 12+, Edge 17+, iOS 12+).
  // Babel + core-js auto-inject only the API polyfills these browsers need.
  // Syntax downleveling to ES2017 is handled by tsdown's `target` option.
  {
    entry: ['src/iife-entry.ts'],
    format: ['iife'],
    globalName: 'responsiveVoice',
    banner,
    define,
    outDir: 'dist',
    outputOptions: (options) => {
      options.entryFileNames = 'responsivevoice.js';
      return options;
    },
    minify: true,
    sourcemap: true,
    platform: 'browser',
    target: 'es2017',
    // Bundle workspace dependencies into the IIFE
    noExternal: [
      '@responsivevoice/api-client',
      '@responsivevoice/features',
      '@responsivevoice/types',
      '@responsivevoice/text',
      /^core-js/,
    ],
    plugins: [
      babel({
        babelHelpers: 'bundled',
        // Only process core's own source files — workspace dep dist files
        // are already bundled; their polyfill needs are covered by core's entry.
        include: ['src/**'],
        presets: [
          '@babel/preset-typescript',
          [
            '@babel/preset-env',
            {
              targets: {
                chrome: '66',
                firefox: '57',
                safari: '12',
                edge: '17',
                ios: '12',
              },
              useBuiltIns: 'usage',
              corejs: '3.49',
            },
          ],
        ],
        extensions: ['.ts', '.js', '.mjs', '.cjs'],
      }),
    ],
  },
]);
