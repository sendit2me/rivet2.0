# Rivet Developer Docs

Maintainer-facing documentation for the current Rivet 2 monorepo.

Start here when changing architecture, runtime behavior, package boundaries, build
contracts, or source layout. User-facing docs live under `packages/docs/docs`.

## Core Docs

- [Overview](./OVERVIEW.md)
- [Package Boundaries](./PACKAGES.md)
- [Repo File Tree](./REPO-FILE-TREE.md)
- [Build And CI](./BUILD-AND-CI.md)
- [App Architecture](./APP-ARCHITECTURE.md)
- [Core Engine](./CORE-ENGINE.md)
- [Execution Data Flow](./EXECUTION-DATA-FLOW.md)
- [Plugin System](./PLUGIN-SYSTEM.md)
- [Unreachable Graph Detection](./UNREACHABLE-GRAPH-DETECTION.md)

## Refactor Tracking

- [Active Refactor Plan](../refactor.md)
- [Refactor History](../refactor-history.md)
- [Repo Maintainability Refactor Plan](../repo-maintainability-refactor-plan.md)

When changing code structure, update the relevant developer doc in the same
change so future maintainers can see the current contract instead of reverse
engineering it from imports.
