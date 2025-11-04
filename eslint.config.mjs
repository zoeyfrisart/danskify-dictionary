// @ts-check
/**
 * Base ESLint 9+ config for the danskify-dictionary parser.
 * Focuses on strict TypeScript + import/order hygiene.
 */

import js from '@eslint/js'
import tseslint from 'typescript-eslint'
import configPrettier from 'eslint-config-prettier'
import importPlugin from 'eslint-plugin-import-x'
import perfectionist from 'eslint-plugin-perfectionist'
import unicorn from 'eslint-plugin-unicorn'
import globals from 'globals'

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore — unicorn still migrating to flat config
  unicorn.configs['flat/recommended'],
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  configPrettier,
  {
    ignores: [
      'node_modules',
      'dist',
      'coverage',
      '.yarn',
      'scripts/dev',
      '*.config.*'
    ]
  },
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node
      },
      parserOptions: {
        project: './tsconfig.json'
      }
    },
    plugins: {
      'import-x': importPlugin,
      perfectionist
    },
    rules: {
      // Core TS rules
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_' }
      ],
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'separate-type-imports' }
      ],

      // General code hygiene
      eqeqeq: ['error', 'always'],
      curly: 'error',
      'no-console': 'off',
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': 'error',
      'no-param-reassign': 'error',

      // Unicorn
      'unicorn/filename-case': 0,
      'unicorn/prefer-module': 'off',
      'unicorn/no-null': 'off',
      'unicorn/prefer-top-level-await': 'off',

      // Imports
      'import-x/no-unresolved': 'off',
      'import-x/newline-after-import': 'error',

      // Perfectionist sorting
      'perfectionist/sort-imports': [
        'error',
        {
          groups: [
            ['builtin', 'external'],
            'internal',
            ['parent', 'sibling', 'index']
          ],
          order: 'asc',
          type: 'natural'
        }
      ]
    }
  },
  {
    files: ['**/*.ts'],
    rules: {
      '@typescript-eslint/array-type': ['error', { default: 'array' }],
      '@typescript-eslint/consistent-type-definitions': ['error', 'interface']
    }
  }
)
