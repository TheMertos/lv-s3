import js from '@eslint/js'
import importPlugin from 'eslint-plugin-import'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import sonarjs from 'eslint-plugin-sonarjs'
import unusedImports from 'eslint-plugin-unused-imports'
import globals from 'globals'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'src/api/generated/**']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'unused-imports': unusedImports,
      import: importPlugin,
      sonarjs,
    },
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.app.json',
        },
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'unused-imports/no-unused-imports': 'error',
      'unused-imports/no-unused-vars': [
        'error',
        { vars: 'all', args: 'after-used', argsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
      'import/no-duplicates': 'error',
      'import/order': [
        'error',
        {
          groups: ['builtin', 'internal', 'external', 'parent', 'sibling', 'index'],
          pathGroups: [{ pattern: '@/**', group: 'internal' }],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      'sonarjs/no-identical-functions': 'warn',
    },
  },
  {
    files: ['src/**/*.tsx'],
    ignores: ['src/test/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "JSXOpeningElement[name.name='button']",
          message: 'Use Mantine <Button> instead of a raw <button>.',
        },
        {
          selector:
            "JSXOpeningElement[name.name='input']:not([type='file']):not([type='hidden'])",
          message: 'Use Mantine <TextInput> instead of a raw <input>.',
        },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}'],
    rules: {
      'import/order': 'off',
    },
  },
  {
    files: ['src/context/auth-context.tsx', 'src/context/auth-session.tsx', 'src/i18n/context.tsx'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
  {
    files: ['vite.config.ts'],
    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.node.json',
        },
      },
    },
  },
])
