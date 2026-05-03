import globals from "globals";
import tseslint from "typescript-eslint";
import vitest from "@vitest/eslint-plugin";

export default [
  {
    ignores: [
      "node_modules",
      "**/dist",
      "**/.astro",
      "**/*.cjs",
      "**/playwright-report",
      "**/test-results",
      "e2e-tests/fixtures/sw-app/chaos-maker-sw.js",
      "e2e-tests/fixtures/sw-app/chaos-maker-sw.mjs"
    ],
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
    // Astro's environment declaration uses the framework-standard triple-slash
    // reference to generated `.astro` types.
    files: ["docs/src/env.d.ts"],
    rules: {
      "@typescript-eslint/triple-slash-reference": "off",
    },
  },
  {
    // Configuration for test files
    files: ["**/*.test.ts", "packages/*/test/**/*.spec.ts"],
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
  {
    files: ["packages/core/src/**/*.ts"],
    ignores: ["packages/core/src/prng.ts"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: "Use the seeded PRNG (this.random / random parameter). See packages/core/src/prng.ts.",
        },
      ],
    },
  },
];
