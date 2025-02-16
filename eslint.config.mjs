import globals from "globals";
import pluginJs from "@eslint/js";
import pluginReact from "eslint-plugin-react";
import prettierConf from 'eslint-config-prettier';
import prettier from 'eslint-plugin-prettier';
import process from "process";

/** @type {import('eslint').Linter.Config[]} */
export default [
  {
    // files to ignore linting
    ignores: [
      "dist/",
      "src/assets/",
      "node_modules/",
      "tailwind.config.js",
      "eslint.config.mjs",
    ],
  },
  {
    // files to include linting
    files: ["src/**/*.{js,mjs,cjs,jsx}"],
  },
  {languageOptions: { globals: globals.browser }},
  pluginJs.configs.recommended,
  pluginReact.configs.flat.recommended,
	prettierConf,
  {
    plugins: {
      pluginReact,
      prettier,
    },
    settings: {
      react: {
        version: "detect"
      }
    },
    // custom rules
    rules: {
      "no-unused-vars": [
        "error",
        { varsIgnorePattern: "^_", argsIgnorePattern: "^_" }
      ],
      'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
			'no-trailing-spaces': 'error',
      // 'react/prop-types': 'off', // prop type validation set to off unless it errors for some components, is that desired?
      "prettier/prettier": [
        "error",
        {
          printWidth: 100,
          tabWidth: 2,
          useTabs: false,
          singleQuote: true,
          plugins: ["prettier-plugin-react", "prettier-plugin-tailwindcss"],
        }
      ]
    },
  },
];