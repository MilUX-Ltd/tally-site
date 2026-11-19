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
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      globals: { AbortSignal: 'readonly', console: 'readonly', fetch: 'readonly', process: 'readonly', URL: 'readonly' },
    },
  },
);
