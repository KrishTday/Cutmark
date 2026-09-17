import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from '@next/eslint-plugin-next';

export default [
  {
    ignores: ['.next', 'node_modules', 'out', '.turbo'],
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    ...js.configs.recommended,
  },
  {
    files: ['**/*.{ts,tsx}'],
    ...tseslint.configs.recommended,
  },
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: {
      '@next/next': nextPlugin,
    },
    rules: {
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs['core-web-vitals'].rules,
    },
  },
];
