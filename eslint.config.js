import globals from "globals";
import tseslint from "typescript-eslint";
import vitest from "eslint-plugin-vitest";

export default [
  {
    ignores: ["node_modules", "**/dist", "**/*.cjs"],
  },
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { "argsIgnorePattern": "^_" },
      ],
    },
  },
  {
    // Plain-JS Node scripts (e.g., Playwright webServer entry points) run as CJS.
    files: ["e2e-tests/fixtures/**/*.cjs"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
  {
    // Configuration for test files
    files: ["**/*.test.ts"],
    plugins: {
      vitest,
    },
    rules: {
      ...vitest.configs.recommended.rules,
    },
    languageOptions: {
      globals: {
        ...vitest.environments.env.globals,
      },
    },
  },
  {
    // Cypress specs use Chai assertions (e.g. `expect(x).to.be.true`),
    // which eslint's no-unused-expressions flags as "no-op expression".
    files: ["e2e-tests/cypress/**/*.cy.ts"],
    rules: {
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
];
