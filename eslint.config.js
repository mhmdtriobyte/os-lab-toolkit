import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist', '**/dev-dist', '**/node_modules', 'coverage'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Engines are pure TypeScript: no React, no DOM UI code.
    files: ['packages/*/src/engine/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            { name: '@oslab/core', message: 'Engines may only import @oslab/core/engine.' },
            { name: 'react', message: 'Engines must be framework-free.' },
            { name: 'react-dom', message: 'Engines must be framework-free.' },
          ],
          patterns: [
            {
              group: ['react/*', '@xyflow/*', '@uiw/*', '@codemirror/*'],
              message: 'Engines must be framework-free.',
            },
            { group: ['../ui', '../ui/*'], message: 'Engines must not import UI code.' },
          ],
        },
      ],
    },
  },
);
