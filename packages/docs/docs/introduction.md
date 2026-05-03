---
slug: /
---

# Introduction to Rivet

Welcome to the Rivet User Guide. Rivet 2.0 is a visual AI programming environment for building, debugging, testing, and running graph-based AI workflows.

Rivet 2.0 continues the previous open-source Rivet project as an independently maintained codebase. It keeps the visual graph workflow, but modernizes the editor, execution runtime, plugin model, package names, and wrapper/embedding seams.

## Key Components

Rivet consists of several cooperating parts:

### Rivet Application

The Rivet application is the desktop editor/IDE for creating graph-based AI workflows. It lets you build `.rivet-project` files, inspect every node, run graphs in Browser or Node executor mode, connect to remote debugger servers, manage app-installed plugins, work with datasets, and use tools such as Prompt Designer, Chat Viewer, and Trivet tests.

See this User Guide and the [tutorial](/tutorial) for more information on how to use the Rivet Application.

### Runtime Packages

The public runtime packages are published under the `@valerypopoff` npm scope:

- `@valerypopoff/rivet2-core` contains the graph model, execution engine, built-in nodes, plugin contracts, and shared runtime APIs.
- `@valerypopoff/rivet2-node` adds Node-specific defaults, filesystem loading, Node native APIs, MCP support, Code-node `require()` support, and remote-debugger helpers.
- `@valerypopoff/rivet2-cli` runs and serves Rivet graphs from the command line.

See the [API Reference](/api-reference) for more information on the APIs available and see [integration getting started](/api-reference/getting-started-integration) for more information on how to integrate Rivet into your application.

### Embeddable Source Checkout

Wrapper applications can vendor this repository as a local `rivet/` source folder and import from source-level app seams such as `packages/app/src/host`. This is useful for custom wrappers that need to ship a custom Rivet 2.0 checkout instead of depending on published npm packages.

## Node-Based Editor

Rivet's node-based editor enables you to create, configure, and debug complex AI workflows visually. This makes it easier to understand data flow, inspect state, and fix behavior while a graph is running. Check out the [overview of the interface](/user-guide/overview-of-interface) and [adding & connecting nodes](/user-guide/adding-connecting-nodes) for more information.

## Library of Nodes

Rivet features a library of built-in node types. Some essential nodes include Text, LLM Chat, HTTP Call, Match, Loop Controller, Extract YAML, Extract JSON, Chunk, Trim Chat Messages, MCP nodes, and Code. These nodes can be connected together using wires, allowing data to flow between them.

Documentation for all nodes can be found in the [**Node Reference**](/node-reference).

## Live Debugging

Rivet offers live debugging of AI chains as they run, allowing you to monitor the state of your AI agent in real-time and quickly identify any issues that may arise.

### Remote Debugging

Rivet also supports remote debugging, allowing you to debug AI chains running on a remote server. This is useful for debugging AI agents that are running in a production environment. See the [remote debugging](/user-guide/remote-debugging) section for more information.

### Node Executor

Rivet 2.0 includes an app-executor sidecar for Node-mode graph execution. Node mode is the recommended mode for serious local workflows that need Node APIs, MCP, package-backed Code-node `require()`, or execution behavior that should not be limited by browser CORS.

## Get Started

Now that you have an overview of Rivet and its capabilities, it's time to dive into the documentation and explore its features in more detail. The following sections will guide you through the process of installing Rivet, creating your first AI agent, and using the various tools and nodes available to build powerful AI-driven applications.
