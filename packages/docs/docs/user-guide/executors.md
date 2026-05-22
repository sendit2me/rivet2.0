---
title: Executors
---

Executors are responsible for running graphs in Rivet. In Canvas mode, choose the active executor from the Run context menu in the top app bar. The Settings modal also has a `Default executor` setting; that setting only chooses the executor Rivet starts with next time, and does not change an already-running session.

The Graphs section of the Settings modal also has a `Show node run durations` setting. It is off by default. When enabled, Rivet shows `Duration: ...ms` in node outputs for live runs, Remote Debugger runs, and recordings when timing metadata is available. If the same node runs more than once, including many parallel or sequential runs, Rivet shows the total duration plus one duration line per finished run.

There are 3 possible executors in use at any one time:

## Browser

The browser executor runs inside the same browser/webview process as the Rivet application. It is the simplest executor and is useful for graph logic that does not need Node APIs.

Browser mode is limited by browser security rules. For example, HTTP calls to services that do not allow the Rivet origin can fail with CORS errors. Browser mode also cannot expose Code-family `require` or `process`.

## Node

The Node executor runs graphs through the app-executor sidecar and communicates with the app over the internal executor WebSocket. It is the recommended executor for serious local workflows, including:

- HTTP calls that should not be limited by browser CORS
- MCP nodes
- file-system native APIs
- package-backed Code-family `require`
- workflows that should behave like a Node process rather than a browser tab

The desktop app binds its internal executor to `127.0.0.1:21889` by default. Hosted or containerized wrappers can run the same executor on a different bind host or port with `RIVET_EXECUTOR_HOST`, `RIVET_EXECUTOR_PORT`, `--host`, and `--port`.

For Code, Code (legacy), and Expression nodes, the Node executor prewarms a small pool of single-use worker threads. Each run still gets an isolated worker, but common small workflows avoid paying worker startup time on every run. Hosted or advanced local setups can tune this with `RIVET_CODE_RUNNER_WORKER_POOL_SIZE`; the default is `2`, and `0` disables prewarming.

## Remote

This executor connects to an external Rivet debugger server and lets another process run or debug graphs while Rivet shows live execution. It requires the remote debugger to be set up in that process. While the remote debugger is connected, Rivet disables editor-run controls; start the graph from the remote process and watch the execution in Rivet.

To use the remote executor, connect via the **Remote Debugger** option in the dropdown of the Rivet action bar.

When you choose **Stop Remote Debugger** while Node mode is selected, Rivet restores the internal Node executor session. Hosted wrappers can pass an internal executor URL through `RivetAppHost` so the app classifies that URL as the internal executor rather than as an external remote debugger.
