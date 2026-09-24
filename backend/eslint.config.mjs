import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/**', 'dist/**', '.tmp/**', '.nx/**', 'nx', 'nx.bat'] },
  {
    files: ['tools/**/*.mjs', 'eslint.config.mjs'],
    ...js.configs.recommended,
    languageOptions: {
      globals: { console: 'readonly', process: 'readonly', URL: 'readonly', Buffer: 'readonly' },
    },
  },
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ['apps/**/*.ts', 'libs/**/*.ts', 'database/**/*.ts'],
  })),
  {
    files: ['apps/**/*.ts', 'libs/**/*.ts', 'database/**/*.ts'],
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
);
