# Rivet API Reference

This section of the Rivet documentation goes over the TypeScript APIs for `@valerypopoff/rivet2-core` and `@valerypopoff/rivet2-node`.

To get started with integrating Rivet into your existing TypeScript or JavaScript application, see the [Integration - Getting Started](./api-reference/getting-started-integration.mdx) page.

## `@valerypopoff/rivet2-core`

Rivet core contains the graph model, processor, built-in nodes, plugin contracts, serialization, and shared runtime APIs. It ships ESM, CJS, and TypeScript declaration outputs.

The Rivet application uses Rivet core to run graphs directly in the application.

See the [Rivet core overview](./api-reference/core/overview.mdx) for more information.

## `@valerypopoff/rivet2-node`

Rivet node is the Node.js runtime adapter for Rivet core. It includes helper APIs to load Rivet projects from the filesystem, execute graphs, attach a remote debugger server, provide Node-native APIs, and supply Node defaults for MCP, project references, plugin environment values, and Code-node `require`.

You will most likely want to use Rivet node in your application. All types from Rivet core are re-exported from Rivet node, so you can use Rivet node as a drop-in replacement for Rivet core.

See the [Rivet node overview](./api-reference/node/overview.mdx) for more information.

## `@valerypopoff/rivet2-cli`

The Rivet CLI is a command-line interface for running Rivet graphs from the command line. It is built on top of Rivet node and provides a convenient way to run graphs from the command line, as well as a local HTTP server for running graphs via HTTP requests.

See the [Rivet CLI overview](./cli.md) for more information.

### Requirements

The repository toolchain targets Node.js `20.4.0`. For application integrations, use a modern Node 20 runtime unless a specific package release states otherwise.
