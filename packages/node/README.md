# @rivet2/rivet-node

Node runtime adapter for loading, running, and debugging Rivet 2.0 projects outside the desktop app.

`@rivet2/rivet-node` re-exports the public core runtime surface and adds Node-native project loading, dataset/debugger helpers, project-reference loading, and debugger server APIs.

## Development

```bash
yarn workspace @rivet2/rivet-node run build
yarn workspace @rivet2/rivet-node run test
yarn workspace @rivet2/rivet-node run lint
```

See the root [README](../../README.md), [package docs](../../developer-docs/PACKAGES.md), and [execution data-flow docs](../../developer-docs/EXECUTION-DATA-FLOW.md) for the current runtime contract.
