import { readFileSync } from 'node:fs';
import babel from '@rollup/plugin-babel';
import { defineConfig } from 'tsdown';
import { bannerFor } from './banner.ts';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
const { version } = pkg;
// IIFE Babel target: the browserslist `legacy` env — from the workspace root in
// the monorepo, or mirrored into this package.json in a split repo. Parsed into
// preset-env's object form ("Edge >= 16" -> { edge: '16' }) to avoid a
// browserslist lookup during the build.
const legacyList =
  pkg.browserslist?.legacy ??
  JSON.parse(readFileSync('../../package.json', 'utf8')).browserslist.legacy;
const legacyTargets = Object.fromEntries(
  (legacyList as string[])
    .map((entry) => entry.match(/^(\S+)\s*>=\s*(\d+)/))
    .filter((match): match is RegExpMatchArray => match !== null)
    .map((match) => [match[1].toLowerCase(), match[2]])
    // The stock Android browser breaks preset-env's rolldown transform; Chrome
    // Android is covered by `chrome`.
    .filter(([name]) => name !== 'android')
);
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
  // IIFE bundle (global responsiveVoice); Babel + core-js inject only the needed polyfills.
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
              targets: legacyTargets,
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
