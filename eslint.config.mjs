// @ts-check
import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import astro from 'eslint-plugin-astro';

export default tseslint.config(
  {
    ignores: ['dist/', '.astro/', '.wrangler/', 'node_modules/', 'playwright-report/', 'test-results/', '.claude/'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  ...astro.configs.recommended,
  {
    // Tests match a byte order mark in regular expressions on purpose.
    files: ['tests/**/*.ts'],
    rules: { 'no-irregular-whitespace': ['error', { skipRegExps: true }] },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { AbortSignal: 'readonly', console: 'readonly', fetch: 'readonly', process: 'readonly', URL: 'readonly' },
    },
  },
);
