// Lint for mistakes, not style: Prettier has the look of the code. The type-aware rules catch what the compiler lets
// through: a promise dropped, a comparison that can never be true, a value used as the wrong type.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', '.claude'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: { project: ['./tsconfig.json', './tsconfig.node.json'], tsconfigRootDir: import.meta.dirname },
      globals: { ...globals.browser },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      eqeqeq: ['error', 'always'],
      'no-constant-condition': ['error', { checkLoops: false }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-unnecessary-condition': ['error', { allowConstantLoopConditions: true }],
      '@typescript-eslint/prefer-nullish-coalescing': 'off',
    },
  },
  // The sim is the thing itself: it never reaches React, the DOM or the content, so it can run headless and
  // later behind an API. Lint holds the import rule so it is not kept by memory.
  {
    files: ['src/sim/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', '../content/*', '../../content/*', '**/ui/*'],
              message: 'The sim imports nothing from React, the DOM or content.',
            },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'localStorage', 'requestAnimationFrame'],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Chance comes from the seeded Random handed in.' },
        { object: 'Date', property: 'now', message: 'Time is stepped, never read from the wall clock.' },
      ],
    },
  },
  { files: ['**/*.{js,mjs}'], ...tseslint.configs.disableTypeChecked },
  { files: ['test/**', '*.config.ts'], languageOptions: { globals: { ...globals.node } } },
  prettier,
);
