module.exports = {
    root: true,
    parser: '@typescript-eslint/parser',
    plugins: ['@typescript-eslint/eslint-plugin', 'vitest'],
    extends: [
      'eslint:recommended',
      'plugin:@typescript-eslint/recommended',
      'plugin:vitest/recommended',
    ],
    env: {
      node: true,
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  };