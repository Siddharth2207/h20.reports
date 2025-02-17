import globals from 'globals';
import pluginJs from '@eslint/js';
import prettier from 'eslint-plugin-prettier';
import pluginReact from 'eslint-plugin-react';
import prettierConf from 'eslint-config-prettier';

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    // files to ignore linting
    ignores: [
      'dist/',
      'build/',
      'src/assets/',
      'node_modules/',
      'tailwind.config.js',
      'eslint.config.mjs',
    ],
  },
  {
    // files to include linting
    files: ['src/**/*.{js,mjs,cjs,jsx}'],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        process: 'readonly',
      } 
    }
  },
  pluginJs.configs.recommended,
  pluginReact.configs.flat.recommended,
  prettierConf,
  {
    plugins: {
      react: pluginReact,
      prettier,
    },
    settings: {
      react: {
        version: 'detect'
      }
    },
    // custom lint rules
    rules: {
      'no-console': 'error',
      'no-trailing-spaces': 'error',
      "react/prop-types": "off",
      'no-unused-vars': [
        'error',
        { varsIgnorePattern: '^_', argsIgnorePattern: '^_' }
      ],
      'prettier/prettier': [
        'error',
        {
          tabWidth: 2,
          useTabs: false,
          printWidth: 100,
          singleQuote: true,
          plugins: ['prettier-plugin-react', 'prettier-plugin-tailwindcss'],
        }
      ],
    },
  },
];
