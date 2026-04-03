# Contributing to Chaos Maker

Thanks for your interest in contributing! This guide will help you get started.

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/chaos-maker.git
   cd chaos-maker
   ```
3. Install dependencies:
   ```bash
   pnpm install
   ```
4. Create a feature branch:
   ```bash
   git checkout -b feat/your-feature
   ```

## Development

```bash
pnpm build                # build core + playwright
pnpm test                 # unit tests
pnpm lint                 # eslint
pnpm --filter e2e-tests exec playwright test --project=chromium  # e2e tests
```

### Project Structure

```
packages/
  core/           # @chaos-maker/core — chaos engine (TypeScript, Vite)
  playwright/     # @chaos-maker/playwright — Playwright adapter (tsup)
  extension/      # Chrome extension (Manifest V3)
e2e-tests/        # Playwright E2E test suite
```

### Before Submitting

Run the full validation suite:

```bash
pnpm lint && pnpm test && pnpm build && pnpm --filter e2e-tests exec playwright test --project=chromium
```

All checks must pass. CI runs these same steps on every PR.

## Pull Requests

- Keep PRs focused — one feature or fix per PR
- Include tests for new functionality
- Update documentation if the public API changes
- Follow existing code style (enforced by ESLint)

## Commit Messages

Use [conventional commits](https://www.conventionalcommits.org/):

```
feat(core): add WebSocket chaos support
fix(playwright): handle page close during injection
test(core): add abort timeout edge case test
docs: update README with new preset examples
chore(ci): bump actions to v5
```

## Reporting Issues

- Check existing issues before opening a new one
- Include reproduction steps, expected behavior, and actual behavior
- For bugs, include your Node.js version, browser, and OS

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
