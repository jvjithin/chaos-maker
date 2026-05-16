# @chaos-maker/cypress Changelog

## Unreleased

### Fixed

- Service Worker cleanup now clears both page-buffered and worker-side logs after stopping the worker engine.
- Cleanup documentation now clarifies support-hook cleanup and clean visits after `cy.removeChaos()`.

## 0.4.0 - 2026-04-26

### Added

- Service Worker commands: `cy.injectSWChaos`, `cy.removeSWChaos`, `cy.getSWChaosLog`, and `cy.getSWChaosLogFromSW`.
- Re-exports for SSE config types and GraphQL operation matcher types.
- Documentation examples for Service Worker, SSE, and GraphQL operation chaos.
