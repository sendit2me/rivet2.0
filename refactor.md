# Rivet Refactor Plan - Prioritized Issues & Recommendations

> Problems identified through deep codebase analysis, sorted by **impact/effort ratio**.
> Each issue is rated on **Effort** (S/M/L/XL) and **Impact** (how much it improves
> maintainability, transparency, and refactorability).
>
> Every item includes a **Risks** section to flag what could go wrong.

---

## Tier 1: Quick Wins (Small effort, significant impact)

These can be knocked out in a day or less each and immediately improve code quality.

---

### 1. ~~Eliminate the circular dependency through barrel imports~~ DONE (verified)

**Effort: S | Impact: Medium**

There's a known circular dependency tracked in `eslint.config.mjs` (line 66):

```javascript
'import/no-cycle': 'warn', // TODO: Enable after fixing cycle in CallGraphNode -> globalRivetNodeRegistry
```

**The actual cycle path** (traced through imports):
```
CallGraphNode.ts
  → imports NodeImpl.ts (direct import)
  → NodeImpl.ts is re-exported via exports.ts → index.ts
  → NodeRegistration.ts imports from '../index.js' (barrel)
  → Nodes.ts imports NodeRegistration.ts
  → Nodes.ts imports CallGraphNode.ts (to register it)
  → CYCLE back to CallGraphNode.ts
```

The root cause is `NodeRegistration.ts` importing from `'../index.js'` (the barrel file)
instead of importing specific types from their source files. This drags the entire export
tree into the dependency chain.

**Fix**: Change `NodeRegistration.ts` line 1 from:
```typescript
// BEFORE
import { type ChartNode, type NodeImplConstructor, type NodeImpl, type PluginNodeImpl } from '../index.js';

// AFTER
import { type ChartNode } from './NodeBase.js';
import { type NodeImpl, type NodeImplConstructor } from './NodeImpl.js';
import { type PluginNodeImpl } from './RivetPlugin.js';
```

Then promote the lint rule from `'warn'` to `'error'` and verify the build passes.

**Risks**:
- There may be additional types imported from `../index.js` that need to be traced to
  their source files. Missing one would cause a build error (safe to catch).
- Other files may have similar barrel import patterns that create less-obvious cycles.
  Run `eslint --rule 'import/no-cycle: error'` on the full codebase to catch them all.

---

### 2. ~~Fix the IOProvider interface segregation violation~~ DONE (verified)

**Effort: S | Impact: Medium**

`IOProvider.ts` defines a 14-method interface. Browser implementations throw
"not supported" for 29-36% of methods:

| Implementation | "Not Supported" Methods | Percentage |
|----------------|------------------------|------------|
| BrowserIOProvider | `saveProjectDataNoPrompt`, `loadProjectDataNoPrompt`, `readPathAsString`, `readPathAsBinary` | 29% |
| LegacyBrowserIOProvider | Same + `openDirectory` | 36% |
| TauriIOProvider | (none) | 0% |

**Fix**: Split into two interfaces:
```typescript
// Base interface - all platforms support these
interface IOProvider {
  saveGraphData(graphData: NodeGraph): Promise<void>
  saveProjectData(project: Project, testData: TrivetData): Promise<string | undefined>
  loadGraphData(callback: (graphData: NodeGraph) => void): Promise<void>
  loadProjectData(callback: (data: {...}) => void): Promise<void>
  loadRecordingData(callback: (data: {...}) => void): Promise<void>
  saveString(content: string, defaultFileName: string): Promise<void>
  readFileAsString(callback: (data: string, fileName: string) => void): Promise<void>
  readFileAsBinary(callback: (data: Uint8Array, fileName: string) => void): Promise<void>
}

// Extended interface - only platforms with path-based file access
interface PathBasedIOProvider extends IOProvider {
  saveProjectDataNoPrompt(project: Project, testData: TrivetData, path: string): Promise<void>
  loadProjectDataNoPrompt(path: string): Promise<{...}>
  readPathAsString(path: string): Promise<string>
  readPathAsBinary(path: string): Promise<Uint8Array>
  openDirectory(): Promise<string | string[] | null>
  openFilePath(): Promise<string>
}
```

Then update callers to check `instanceof PathBasedIOProvider` or use a type guard before
calling path-based methods. Remove all `throw new Error('not supported')` stubs.

**Risks**:
- Callers that currently call path-based methods with a `try/catch` around them would need
  to be changed to capability checks. Search for all call sites of the 5 affected methods.
- The `ioProvider` singleton in `globals/ioProvider.ts` would need its type narrowed from
  `IOProvider` to `IOProvider | PathBasedIOProvider` - callers need runtime checks.
- This is **critical groundwork for the web-hosted version**. Getting this wrong could
  block the web migration.

---

### 3. ~~Remove the redundant selectedExecutorState atom~~ DONE (verified)

**Effort: S | Impact: Low**

In `state/execution.ts` (lines 11-14), `selectedExecutorState` is a trivial pass-through
to `defaultExecutorState` from `settings.ts`:

```typescript
export const selectedExecutorState = atom(
  (get) => get(defaultExecutorState),
  (get, set, value: 'browser' | 'nodejs') => set(defaultExecutorState, value),
);
```

**Blast radius**: 6 files import `selectedExecutorState`:
- `useRemoteExecutor.ts`, `useRemoteDebugger.ts`, `useGraphExecutor.ts`,
  `useGetRivetUIContext.ts`, `ActionBarMoreMenu.tsx`, `ActionBar.tsx`

**Fix**: Delete `selectedExecutorState`. In each of the 6 files, replace the import with
`defaultExecutorState` from `state/settings.ts`. The atom signatures are identical (both
read/write `'browser' | 'nodejs'`), so no logic changes needed.

**Risks**:
- Minimal. This is a pure mechanical find-and-replace. If any file was relying on the
  indirection for a reason (e.g., future middleware), that intent would be lost - but
  there's no evidence of this.

---

### 4. ~~Move WebSocket out of Jotai state~~ DONE (verified)

**Effort: S | Impact: Medium**

`remoteDebuggerState` in `state/execution.ts` (lines 16-36) stores a live WebSocket
reference inside a Jotai atom that uses `atomWithStorage` (persistent storage):

```typescript
export type RemoteDebuggerState = {
  socket: WebSocket | null;     // <-- Non-serializable object in persistent state
  started: boolean;
  reconnecting: boolean;
  url: string;
  remoteUploadAllowed: boolean;
  isInternalExecutor: boolean;
};

export const remoteDebuggerState = atomWithStorage<RemoteDebuggerState>(
  'remoteDebuggerState', { socket: null, ... }, storage
);
```

**Two problems**:
1. `WebSocket` objects cannot be serialized to localStorage/IndexedDB. The `socket` field
   will always deserialize as `null` on page reload, making the persistence misleading.
2. When the atom is updated (e.g., `set(remoteDebuggerState, {...})`), the old WebSocket
   may not be properly closed, causing connection leaks.

**Fix**:
1. Split into two atoms:
   ```typescript
   // Persistent config (survives page reload)
   export const remoteDebuggerConfigState = atomWithStorage('remoteDebuggerConfig', {
     url: '',
     remoteUploadAllowed: false,
     isInternalExecutor: false,
   }, storage);

   // Transient runtime state (reset on reload)
   export const remoteDebuggerConnectionState = atom<{
     started: boolean;
     reconnecting: boolean;
   }>({ started: false, reconnecting: false });
   ```
2. Manage the WebSocket instance in `useRemoteDebugger.ts` via a `useRef<WebSocket>`, with
   explicit `close()` on cleanup. The ref is already the natural place for non-serializable
   runtime objects.
3. Update the 3 consumers (`useRemoteDebugger.ts`, `useRemoteExecutor.ts`,
   `ActionBarMoreMenu.tsx`) to read from the appropriate atom.

**Risks**:
- The current code in `useRemoteDebugger.ts` and `useRemoteExecutor.ts` accesses
  `remoteDebugger.socket` in multiple places. All access patterns must be migrated to
  the ref. Missing one would cause a null reference error at runtime.
- Reconnection logic in `useRemoteDebugger.ts` depends on socket state. Make sure the
  ref-based approach still triggers reconnection correctly (may need a state callback).

---

### 5. ~~Add project file validation beyond existence checks~~ DONE (verified)

**Effort: S | Impact: Medium**

`doubleCheckProject()` in `serializationUtils.ts` (lines 7-17) validates only 4 fields:

```typescript
if (!project.metadata || !project.metadata.id || !project.metadata.title ||
    !project.graphs || typeof project.graphs !== 'object') {
  throw new Error('Invalid project file');
}
```

No validation of graph structure, node structure, connections, or data types. A malformed
project file produces cryptic errors deep in the execution engine.

**Fix**: Add structural validation after deserialization:
```typescript
function validateProject(project: Project): ValidationResult {
  const errors: string[] = [];

  if (!project.metadata?.id) errors.push('Missing project ID');
  if (!project.metadata?.title) errors.push('Missing project title');

  for (const [graphId, graph] of Object.entries(project.graphs)) {
    if (!Array.isArray(graph.nodes)) errors.push(`Graph ${graphId}: nodes is not an array`);
    if (!Array.isArray(graph.connections)) errors.push(`Graph ${graphId}: connections is not an array`);

    for (const node of graph.nodes ?? []) {
      if (!node.id) errors.push(`Graph ${graphId}: node missing id`);
      if (!node.type) errors.push(`Graph ${graphId}: node ${node.id} missing type`);
    }

    for (const conn of graph.connections ?? []) {
      if (!conn.inputNodeId || !conn.outputNodeId)
        errors.push(`Graph ${graphId}: connection missing node reference`);
    }
  }

  return { valid: errors.length === 0, errors };
}
```

Show validation errors in a user-friendly dialog instead of a generic "Invalid project file".
For partially valid files, offer to load what's valid and discard broken sections.

**Risks**:
- Overly strict validation could reject files that the current engine handles gracefully
  (e.g., nodes with extra/missing fields). Start with structural checks only, not content
  validation. Test against every `.rivet-project` file in the examples/ directory.
- Adding Zod as a dependency increases bundle size (~13KB gzipped). If bundle size is
  a concern, hand-roll the validators.

---

### 6. ~~Fix silent plugin loading failures~~ DONE (verified)

**Effort: S | Impact: Medium**

In `useProjectPlugins.ts` (line 75), plugin load failures are caught, logged to console,
and silently swallowed. The user gets no indication that a plugin failed to load - nodes
from that plugin simply don't appear in the palette.

```typescript
} catch (err) {
  console.error(`Failed to load plugin ${spec.id}: ...`);
  return null;  // Silent failure
}
```

**Fix**:
1. Add a `failedPluginsState` atom (array of `{ id, error, spec }`).
2. In the catch block, push the error into that atom instead of returning null.
3. Show a toast notification: "Plugin {name} failed to load. Check Settings > Plugins."
4. In the Plugins settings page, show failed plugins with their error messages and a
   "Retry" button.
5. In the node picker, show a "(plugin unavailable)" group for failed plugins so users
   understand why nodes are missing.

**Risks**:
- If a plugin fails on every load (e.g., deleted npm package), the toast could become
  annoying. Add a "Don't show again for this plugin" option or only toast once per session.
- Plugin errors during startup could flood the UI if multiple plugins fail simultaneously.
  Batch errors into a single notification: "3 plugins failed to load."

---

### 7. ~~Clean up 49 `as any` type casts~~ DONE (verified)

**Effort: S-M | Impact: Medium**

49 `as any` casts across the codebase, including dangerous patterns like
`as unknown as NodeImpl<T>` in `NodeRegistration.ts` (lines 118, 140).

Breakdown:
- `packages/app/src/`: 17 casts (ResizeHandle: 5, TripleBarColorPicker: 3, others)
- `packages/core/src/`: 32 casts (GraphProcessor, DataValue, NodeRegistration, etc.)

**Fix** (by priority):

1. **ResizeHandle.tsx** (5 casts): Fix by properly typing the Atlaskit resize event handlers.
   These are likely caused by missing type declarations from `@atlaskit/pragmatic-drag-and-drop`
   or similar. Add explicit event types or use `React.SyntheticEvent`.

2. **NodeRegistration.ts** (2 casts, `as unknown as NodeImpl<T>`): The most dangerous casts.
   These exist because the registry stores heterogeneous node implementations. Consider using
   a generic wrapper type or a type-safe Map implementation with brand checking.

3. **TripleBarColorPicker.tsx** (3 casts): Likely fixable by typing the color picker component
   props correctly.

4. **Remaining 39 casts**: Audit individually. Categorize as:
   - Fixable with proper generics (most common)
   - Fixable with type guards / narrowing
   - Legitimate (rare - document with `// eslint-disable-next-line` + comment)

**Risks**:
- Some `as any` casts exist because third-party library types are wrong or incomplete
  (e.g., Atlaskit). These may require `@ts-expect-error` instead of `as any` to keep
  the intent clear, but the underlying issue can't be fixed without upstream changes.
- The `NodeRegistration` casts are deeply architectural - the registry fundamentally
  stores `NodeImpl<SomeNode>` but retrieves `NodeImpl<AnyNode>`. A true fix may require
  redesigning the registry's type signature (higher effort than S).

---

### 8. ~~Eliminate global mutable singletons~~ DONE (verified)

**Effort: S | Impact: Medium**

Four module-level singletons initialized at import time in `utils/globals/`:

```typescript
// ioProvider.ts - conditional singleton
let ioProvider: IOProvider;
if (TauriIOProvider.isSupported()) { ioProvider = new TauriIOProvider(); }
else if (BrowserIOProvider.isSupported()) { ioProvider = new BrowserIOProvider(); }
else { ioProvider = new LegacyBrowserIOProvider(); }

// datasetProvider.ts - direct singleton
const datasetProvider = new BrowserDatasetProvider();

// audioProvider.ts - direct singleton
const audioProvider = new TauriBrowserAudioProvider();

// globalDataRefs.ts - LRU cache singleton
const globalDataRefs = new LRUCache<string, DataValue>({ maxSize: 500 * 1024 * 1024 });
```

No barrel file exports these - each is imported individually. They're impossible to mock
for testing and create hidden coupling throughout the app.

**Fix**:
1. Create a `ProvidersContext` using React Context:
   ```typescript
   type Providers = {
     io: IOProvider;
     datasets: DatasetProvider;
     audio: AudioProvider;
     dataRefs: DataRefStore;
   };

   const ProvidersContext = createContext<Providers>(null!);
   export const useProviders = () => useContext(ProvidersContext);
   ```
2. Initialize providers in `App.tsx` and wrap the app in `<ProvidersContext.Provider>`.
3. Replace all direct singleton imports with `useProviders()` in components and hooks.
4. For non-React code that needs providers (utilities, services), pass them as parameters.

**Risks**:
- Many files (hooks, components) import these singletons directly. The migration touches
  every file that uses `ioProvider`, `datasetProvider`, `audioProvider`, or `globalDataRefs`.
  Use `grep` to find all import sites and migrate systematically.
- The `globalDataRefs` LRU cache is used outside React (in state atoms and utilities).
  These can't use React Context. Either keep it as a module-level instance or pass it
  through a non-React DI mechanism.
- Import-time initialization means the current code works even before React renders.
  Context-based providers only work after the React tree mounts, so any code that runs
  before mount needs special handling.

---

### 9. ~~Inject concrete dependencies in GraphProcessor~~ DONE (verified)

**Effort: S | Impact: Medium**

`GraphProcessor` has two hard-coded dependency patterns:

1. **Line 283**: Falls back to `globalRivetNodeRegistry` if no registry provided:
   ```typescript
   this.#registry = registry ?? (globalRivetNodeRegistry as unknown as NodeRegistration);
   ```
2. **Line 1501**: Creates `GptTokenizerTokenizer` inline if context doesn't provide one:
   ```typescript
   let tokenizer = this.#context.tokenizer;
   if (!tokenizer) {
     tokenizer = new GptTokenizerTokenizer();
   }
   ```

**Fix**:
1. Make `registry` a required constructor parameter (remove the `??` fallback):
   ```typescript
   constructor(
     project: Project,
     graphId: GraphId,
     registry: NodeRegistration,  // Required, no default
     includeTrace?: boolean
   )
   ```
2. Make `tokenizer` required in `ProcessContext` (callers must provide it):
   ```typescript
   type ProcessContext = {
     tokenizer: Tokenizer;  // Required (was effectively optional)
     // ...
   };
   ```
3. Update all call sites:
   - `useLocalExecutor.ts`: Already has access to the registry via `globalRivetNodeRegistry`
   - `app-executor/bin/executor.mts`: Already creates a registry
   - `rivet-node/src/api.ts`: Creates a registry in `createProcessor()`

**Risks**:
- This changes the public API of `GraphProcessor` and `ProcessContext`. Any external
  consumers (npm users of `@ironclad/rivet-core`) that rely on the optional registry
  will break. This is a semver-major change.
- Mitigation: Keep the fallback for one release with a deprecation warning, then remove.

---

### 10. ~~De-duplicate repeated patterns in GraphProcessor~~ DONE (verified)

**Effort: S | Impact: Medium**

At least 4 verified duplicated code patterns in `GraphProcessor.ts`:

| Pattern | Occurrences | Lines | Notes |
|---------|-------------|-------|-------|
| Input readiness check | 2x (exact) | 972-975, 1064-1067 | Identical code |
| Errored input nodes check | 2x (near) | 964-968, 1055-1060 | Second adds trace event |
| Cost accumulation from outputs | 2x (exact) | 1345-1347, 1375-1377 | Identical code |
| Control flow exclusion check | 3x | 1079, 1294, 1418 | Same call pattern |

**Fix**: Extract each into a focused private method:
```typescript
#areInputsReady(node: ChartNode): boolean {
  return this.#definitions[node.id]!.inputs.every((input) => {
    const conn = this.#connections.find(c => c.inputId === input.id && c.inputNodeId === node.id);
    return conn || !input.required;
  });
}

#hasErroredInputNode(node: ChartNode, inputNodes: ChartNode[], trace = false): boolean {
  for (const inputNode of inputNodes) {
    if (this.#erroredNodes.has(inputNode.id)) {
      if (trace) this.#emitTraceEvent(`Node ${node.title} has errored input node ${inputNode.title}`);
      return true;
    }
  }
  return false;
}

#accumulateCost(output: Outputs): void {
  if (output['cost' as PortId]?.type === 'number') {
    this.#totalCost += coerceTypeOptional(output['cost' as PortId], 'number') ?? 0;
  }
}
```

This removes ~50 lines of duplication and makes the execution logic more readable.

**Risks**:
- Extracting methods from a tightly coupled class requires verifying that all call sites
  have identical semantics. The errored nodes check has a subtle difference (one adds a
  trace event) - the extracted method must handle both cases via parameter, as shown above.
- Changing the control flow of `#fetchNodeDataAndProcessNode` and
  `#processNodeIfAllInputsAvailable` could introduce subtle ordering bugs. Run the
  existing 7 test files after each extraction to catch regressions.

---

## Tier 2: Strategic Investments (Medium effort, high impact)

These require a few days to a week each but substantially improve the codebase.

---

### 11. ~~Break up the 3 largest methods in GraphProcessor~~ DONE (verified)

**Effort: M | Impact: High**

Three methods exceed 140 lines each with 4-5 levels of nesting:

| Method | Lines | Responsibilities |
|--------|-------|------------------|
| `#processNodeIfAllInputsAvailable` | ~230 | Input readiness, error checking, control flow, loop handling, split run dispatch |
| `#processNodeWithInputData` | ~200 | Context construction, subprocessor setup, 15+ event listener wiring |
| `processGraph` | ~145 | State init, node scheduling, completion detection, error handling |

**Fix**: Break each into 3-5 focused methods:

**`#processNodeIfAllInputsAvailable`** (~230 lines → 3 methods):
```typescript
// 1. Check if node can execute
#canNodeExecute(node, inputNodes, connections): { ready: boolean; reason?: string }

// 2. Resolve control flow (if/else, loops, races)
#resolveControlFlow(node, inputValues, processId): { excluded: boolean }

// 3. Dispatch to appropriate execution strategy
#dispatchExecution(node, inputValues): Promise<void>  // calls normal or split-run
```

**`#processNodeWithInputData`** (~200 lines → extract class):
```typescript
class ProcessContextBuilder {
  constructor(processor: GraphProcessor, context: ProcessContext) {}

  build(node: ChartNode, processId: ProcessId): InternalProcessContext {
    // ~80 lines: build the context object
  }

  #wireSubProcessorEvents(subProcessor: GraphProcessor): void {
    // ~80 lines: attach 15+ event listeners
  }
}
```

**`processGraph`** (~145 lines → 3 phases):
```typescript
async processGraph(context: ProcessContext, inputs?: Record<string, DataValue>) {
  this.#initializeExecution(context, inputs);   // ~30 lines
  await this.#executeNodeLoop();                 // ~60 lines
  return this.#collectResults();                 // ~30 lines
}
```

**Risks**:
- Breaking up methods in a stateful class risks losing the implicit ordering guarantees
  that the monolithic methods enforce. Each extracted method must have clear
  preconditions documented in its JSDoc.
- The `#processNodeWithInputData` method uses closure-captured variables from its parent
  scope. Extracting to a class means those variables must become constructor parameters
  or method arguments - verify nothing is missed.
- This is a prerequisite for Item 20 (full GraphProcessor decomposition). Do this first
  to validate the approach before the larger refactor.

---

### 12. ~~Type the WebSocket protocol~~ DONE (verified)

**Effort: M | Impact: High**

17 incoming + 8 outgoing message types with inconsistent format and zero type safety.

**Current inconsistency** (verified):
- **Incoming** (`useRemoteDebugger.ts` line 75): `const { message, data } = JSON.parse(event.data)` - uses `message` field
- **Outgoing** (`useRemoteDebugger.ts` line 117): `JSON.stringify({ type, data })` - uses `type` field
- **Dataset responses** (`useRemoteDebugger.ts` line 135+): use `type` field
- **Static data** (`useRemoteExecutor.ts` line 168): raw string `set-static-data:${id}:${dataValue}` - no JSON

**Fix**: Create a shared protocol definition in `packages/core/`:

```typescript
// packages/core/src/model/ExecutorProtocol.ts

// Messages FROM executor TO app
export type ExecutorToAppMessage =
  | { type: 'nodeStart'; data: { nodeId: NodeId; processId: ProcessId } }
  | { type: 'nodeFinish'; data: { nodeId: NodeId; processId: ProcessId; outputs: Outputs } }
  | { type: 'nodeError'; data: { nodeId: NodeId; processId: ProcessId; error: string } }
  | { type: 'nodeExcluded'; data: { nodeId: NodeId; processId: ProcessId } }
  | { type: 'start'; data: {} }
  | { type: 'done'; data: { results: Record<string, DataValue> } }
  | { type: 'abort'; data: {} }
  | { type: 'graphAbort'; data: { error: string } }
  | { type: 'partialOutput'; data: { nodeId: NodeId; outputs: Outputs; index: number } }
  | { type: 'graphStart'; data: { graphId: GraphId } }
  | { type: 'graphFinish'; data: { graphId: GraphId } }
  | { type: 'nodeOutputsCleared'; data: { nodeId: NodeId } }
  | { type: 'trace'; data: { message: string } }
  | { type: 'pause'; data: {} }
  | { type: 'resume'; data: {} }
  | { type: 'error'; data: { error: string } }
  | { type: 'userInput'; data: { nodeId: NodeId; questions: string[] } }
  // Dataset responses
  | { type: `datasets:${string}`; data: unknown };

// Messages FROM app TO executor
export type AppToExecutorMessage =
  | { type: 'run'; data: { graphId: GraphId; contextValues?: Record<string, DataValue>; ... } }
  | { type: 'abort'; data: {} }
  | { type: 'pause'; data: {} }
  | { type: 'resume'; data: {} }
  | { type: 'user-input'; data: { nodeId: NodeId; answers: string[] } }
  | { type: 'set-dynamic-data'; data: { project: Project; settings: Settings } }
  | { type: 'set-static-data'; data: { id: string; value: DataValue } }
  | { type: 'preload'; data: { nodeData: Record<NodeId, Outputs> } };

// Type-safe send/receive helpers
export function parseExecutorMessage(raw: string): ExecutorToAppMessage { ... }
export function serializeAppMessage(msg: AppToExecutorMessage): string { ... }
```

Then update both sides:
- `useRemoteDebugger.ts`: Use `parseExecutorMessage()` in `onmessage` handler
- `useRemoteExecutor.ts`: Use `serializeAppMessage()` for all sends
- `app-executor`: Use the same types for emit/receive

**Risks**:
- Changing the message field from `message` to `type` (or vice versa) in incoming messages
  requires updating the executor sidecar simultaneously. Both sides must be deployed
  together. Consider a migration period where both field names are accepted.
- The `set-static-data` raw string format needs special handling. The protocol type wraps
  it in a proper JSON structure, but the executor must be updated to accept the new format.
- This touches the critical execution path. Test with both browser and Node.js executors
  to verify no messages are dropped.

---

### 13. ~~Decouple from Tauri (22 files with direct imports)~~ DONE (verified)

**Effort: M | Impact: High (critical for web version)**

22 files in `packages/app/src/` directly import from `@tauri-apps/api/*`, bypassing
the IOProvider abstraction:

**Components** (6): UpdateModal, SettingsModal, PluginsOverlay, PluginInfoModal,
AiAssistEditorBase, NeedsLoginPage

**Hooks** (10): useAiGraphBuilder, useCheckForUpdate, useExecutorSidecar,
useGlobalShortcut, useGraphRevisions, useLoadPackagePlugin, useMenuCommands,
useMonitorUpdateStatus, useOpenUrl, useRemoteDebugger

**Utils** (2): tauri.ts, ProjectRevisionCalculator.ts

**IO** (1): datasets.ts

**Model** (1): TauriProjectReferenceLoader.ts

A partial `TauriNativeApi.ts` already exists at `packages/app/src/model/native/TauriNativeApi.ts`
(90 lines, implements `NativeApi` interface with 5 of 6 methods - `exec()` is stubbed).

**Fix**: Expand the `NativeApi` interface to cover ALL Tauri capabilities used across the 22 files:

```typescript
interface NativeApi {
  // File system (already in TauriNativeApi)
  readdir(path: string, options?: ReadDirOptions): Promise<FileEntry[]>
  readTextFile(path: string): Promise<string>
  readBinaryFile(path: string): Promise<Uint8Array>
  writeTextFile(path: string, content: string): Promise<void>

  // New methods needed
  openUrl(url: string): Promise<void>                    // used by useOpenUrl, NeedsLoginPage
  showDialog(options: DialogOptions): Promise<string>    // used by SettingsModal, PluginsOverlay
  getEnvironmentVariable(name: string): Promise<string>  // used by tauri.ts
  spawnSidecar(name: string, args: string[]): Process    // used by useExecutorSidecar, useLoadPackagePlugin
  registerGlobalShortcut(key: string, handler: () => void): Disposable  // used by useGlobalShortcut
  checkForUpdate(): Promise<UpdateInfo | null>           // used by useCheckForUpdate, useMonitorUpdateStatus
  installUpdate(): Promise<void>                         // used by UpdateModal
  registerMenuHandler(handler: (event: MenuEvent) => void): Disposable  // used by useMenuCommands
}

class BrowserNativeApi implements NativeApi {
  // Provide web-compatible implementations or no-ops
  openUrl(url: string) { window.open(url, '_blank'); }
  getEnvironmentVariable() { return Promise.resolve(''); }
  spawnSidecar() { throw new Error('Sidecar not available in browser'); }
  // etc.
}
```

Then migrate each of the 22 files to import from the `NativeApi` abstraction instead
of `@tauri-apps/api/*`. This is the largest Tier 2 item - consider breaking it into
sub-PRs by category (file system, shell, dialog, etc.).

**Risks**:
- Some Tauri APIs have no web equivalent (sidecar spawning, global shortcuts, auto-update).
  The browser implementation must gracefully degrade - features should be hidden/disabled,
  not crash. This requires feature detection throughout the UI.
- Plugin loading (`useLoadPackagePlugin.ts`) is deeply Tauri-coupled - it uses Tauri's
  shell API to run pnpm, Tauri's file system for extraction, and Tauri's path API for
  cache directories. The browser version needs a completely different plugin loading
  strategy (e.g., CDN-hosted ESM modules).
- `useExecutorSidecar.ts` spawns a Node.js process - the web version needs a different
  executor (WebSocket to a remote server). This is a feature-level change, not just an
  abstraction swap.

---

### 14. ~~Break up useCurrentExecution (544 lines, 19 methods)~~ DONE (verified)

**Effort: M | Impact: High**

This hook returns an object with **19 methods** (verified), each updating 1-3 Jotai atoms.
It mixes data transformation (sanitizeDataValueForLength, convertToRef,
cloneNodeDataForHistory) with state management.

**Fix**:
1. **Extract data transformation** (~100 lines) to `utils/executionDataTransforms.ts`:
   ```typescript
   export function sanitizeDataValueForLength(value: DataValue, maxLength: number): DataValue
   export function convertToRef(value: DataValue, refStore: DataRefStore): DataValue
   export function cloneNodeDataForHistory(data: ProcessDataForNode[]): ProcessDataForNode[]
   ```

2. **Split into 3 focused hooks**:
   ```typescript
   // useNodeExecutionEvents.ts (~150 lines)
   // Handles: onNodeStart, onNodeFinish, onNodeError, onNodeExcluded, onNodeOutputsCleared, onPartialOutput
   export function useNodeExecutionEvents() { ... }

   // useGraphExecutionEvents.ts (~100 lines)
   // Handles: onStart, onDone, onAbort, onError, onGraphStart, onGraphFinish, onGraphAbort, onPause, onResume
   export function useGraphExecutionEvents() { ... }

   // useExecutionDataFlow.ts (~100 lines)
   // Handles: setDataForNode, onUserInput, onTrivetStart
   export function useExecutionDataFlow() { ... }
   ```

3. **Create a composition hook** that combines them for backward compatibility:
   ```typescript
   export function useCurrentExecution() {
     return {
       ...useNodeExecutionEvents(),
       ...useGraphExecutionEvents(),
       ...useExecutionDataFlow(),
     };
   }
   ```

**Risks**:
- The 19 methods share closure-captured references (atom setters, refs). Splitting into
  separate hooks means each sub-hook needs its own atom imports. Verify no circular
  dependencies between the sub-hooks.
- `useLocalExecutor.ts` and `useRemoteExecutor.ts` destructure the return value. Both
  files need to be updated if the return shape changes.
- The composition hook approach preserves backward compatibility but doesn't reduce
  re-render scope. For full benefit, consumers should import the specific sub-hook they need.

---

### 15. ~~Reduce VisualNode prop drilling (28 props)~~ DONE (verified)

**Effort: M | Impact: High**

The prop chain passes 25-28 props through 4 layers (verified counts):

```
NodeCanvas (8 props)
  → DraggableNode (25 props)
    → VisualNode (28 props in type definition)
      → NormalVisualNodeContent / ZoomedOutVisualNodeContent (~17 props each)
        → NodePortsRenderer (8+ props)
```

**Fix**: Introduce a `CanvasContext` for data that is the same across all nodes in a
render cycle:

```typescript
type CanvasContextValue = {
  // Constant per render cycle - don't need to be props on every node
  canvasZoom: number;
  isZoomedOut: boolean;
  isReallyZoomedOut: boolean;
  draggingWire: DraggingWireDef | undefined;
  heightCache: HeightCache;

  // Event handlers (stable references via useCallback)
  onWireStartDrag: (port: PortId, node: NodeId) => void;
  onWireEndDrag: (port: PortId, node: NodeId) => void;
  onNodeSelected: (node: NodeId, multi: boolean) => void;
  onNodeStartEditing: (node: NodeId) => void;
  onNodeSizeChanged: (node: NodeId, w: number, h: number) => void;
  onMouseOver: (event: MouseEvent, nodeId: NodeId) => void;
  onMouseOut: (event: MouseEvent, nodeId: NodeId) => void;
  onPortMouseOver: (...) => void;
  onPortMouseOut: (...) => void;
  onResizeFinish: (...) => void;
};

const CanvasContext = createContext<CanvasContextValue>(null!);
```

This would reduce VisualNode from 28 props to ~8 (node-specific only: node, connections,
xDelta, yDelta, isDragging, isSelected, isPinned, lastRun, processPage).

**Risks**:
- React Context causes all consumers to re-render when any value changes. The context
  value must be memoized with `useMemo` and callbacks must be stable (`useCallback`).
  If the memo dependencies are wrong, every node re-renders on every frame.
- The `heightCache` and event handlers are performance-critical in the canvas. Profile
  before and after to verify no regression in canvas performance with 50+ nodes.
- `isZoomedOut` and `isReallyZoomedOut` change on zoom - this would cause all nodes to
  re-render on zoom. The current prop approach may actually be better for zoom performance
  because React can bail out per-node. Consider splitting into a `ZoomContext` (changes
  on zoom) and a `CanvasHandlersContext` (stable).

---

### 16. ~~Optimize ioDefinitionsState (cascading recomputes)~~ DONE (verified)

**Effort: M | Impact: High**

This atom (in `state/graph.ts` lines 116-162) reads 5 atoms and recomputes ALL node IO
definitions whenever ANY dependency changes:

```typescript
export const ioDefinitionsState = atom((get) => {
  const nodeInstances = get(nodeInstancesState);           // dep 1
  const connectionsForNode = get(connectionsForNodeState); // dep 2
  const nodesById = get(nodesByIdState);                   // dep 3
  const project = get(projectState);                       // dep 4
  const referencedProjects = get(referencedProjectsState); // dep 5
  // Loops through ALL nodes, calling getInputDefinitions + getOutputDefinitions on each
  return mapValues(nodesById, (node) => { ... });
});
```

Editing one node triggers O(n) recomputation across all nodes.

**Fix**: Replace the global computation with per-node atomFamily computation:

```typescript
// Remove the global ioDefinitionsState atom entirely

// Make ioDefinitionsForNodeState the primary computation
export const ioDefinitionsForNodeState = atomFamily((nodeId: NodeId) =>
  atom((get) => {
    const instance = get(nodeInstanceByIdState(nodeId));
    const connections = get(connectionsForSingleNodeState(nodeId));
    const nodesById = get(nodesByIdState);
    const project = get(projectState);
    const referencedProjects = get(referencedProjectsState);

    if (!instance) return undefined;

    return {
      inputs: instance.getInputDefinitions(connections, nodesById, project, referencedProjects),
      outputs: instance.getOutputDefinitions(connections, nodesById, project, referencedProjects),
    };
  })
);
```

Now editing node A only recomputes IO definitions for nodes whose connections changed,
not all nodes.

**Risks**:
- `nodesById` and `projectState` are still global dependencies. If these change, all
  per-node atoms recompute anyway. The benefit comes primarily from isolating connection
  changes to affected nodes only.
- Components that previously read `ioDefinitionsState` (the global map) need to be
  updated to read per-node. Search for all consumers: WireLayer, useGetNodeIO,
  useDraggingWire, etc.
- The WireLayer reads IO definitions for ALL visible nodes in one render. If it switches
  from reading one global atom to N per-node atoms, it may cause more Jotai subscriptions.
  Profile to verify this is actually faster.

---

### 17. ~~Add atomFamily cleanup~~ DONE (verified)

**Effort: M | Impact: Medium**

8 atomFamily instances (verified) create atoms dynamically, none with cleanup:

| atomFamily | File | Key | Risk |
|-----------|------|-----|------|
| `connectionsForSingleNodeState` | graph.ts:95 | NodeId | Grows with deleted nodes |
| `nodeByIdState` | graph.ts:99 | NodeId | Stale references |
| `nodeInstanceByIdState` | graph.ts:114 | NodeId | Memory + stale impls |
| `ioDefinitionsForNodeState` | graph.ts:164 | NodeId | Expensive cached computation |
| `lastRunDataState` | dataFlow.ts:77 | NodeId | Execution data accumulates |
| `selectedProcessPageState` | dataFlow.ts:91 | NodeId | Page tracking per node |
| `isPinnedState` | graphBuilder.ts:73 | NodeId | Minor |
| `projectContextState` | savedGraphs.ts:179 | ProjectId | Persisted, never cleaned |

**Fix**:
1. Add cleanup when nodes are deleted. In `deleteNodeCommand.ts`, after removing the node:
   ```typescript
   // Clean up atomFamily entries for deleted nodes
   for (const nodeId of deletedNodeIds) {
     nodeByIdState.remove(nodeId);
     nodeInstanceByIdState.remove(nodeId);
     ioDefinitionsForNodeState.remove(nodeId);
     connectionsForSingleNodeState.remove(nodeId);
     lastRunDataState.remove(nodeId);
     selectedProcessPageState.remove(nodeId);
     isPinnedState.remove(nodeId);
   }
   ```
2. Add cleanup when graphs are switched (many NodeId-keyed atoms become stale).
3. Add cleanup when projects are closed (`projectContextState.remove(projectId)`).

**Risks**:
- Calling `atomFamily.remove(key)` while a component is subscribed to that atom could
  cause the component to read stale/undefined data. Ensure cleanup only happens after
  the UI has unmounted or updated to reflect the deletion.
- The `lastRunDataState` atomFamily stores execution results. Users may switch between
  graphs and expect to see previous run data. Don't clean up on graph switch - only on
  explicit project close or "Clear execution data" action.
- `projectContextState` uses `atomWithStorage` - removing it should also clear the
  persisted storage entry.

---

### 18. ~~Standardize error handling patterns~~ DONE (verified)

**Effort: M | Impact: Medium**

Three competing error handling patterns in the app:

1. **`try/catch` + `toast.error()`** (most common, ~40 instances)
2. **`swallowPromise()`** in `utils/syncWrapper.ts` - catches and toasts, loses stack trace:
   ```typescript
   export function swallowPromise<T extends Promise<void>>(promise: T): void {
     promise.catch((err) => { toast.error(err.message); });
   }
   ```
3. **Fire-and-forget** - async functions called without `await` or `.catch()` (~20 instances)

No global error boundary. No error tracking service. No `unhandledrejection` listener.

**Fix**:
1. **Create a central error handler**:
   ```typescript
   // utils/errorHandling.ts
   export function handleError(err: unknown, context: string): void {
     const error = getError(err);
     console.error(`[${context}]`, error);
     toast.error(`${context}: ${error.message}`);
     // Future: send to error tracking service
   }

   export function wrapAsync<T>(
     fn: () => Promise<T>,
     context: string
   ): () => Promise<T | undefined> {
     return async () => {
       try { return await fn(); }
       catch (err) { handleError(err, context); return undefined; }
     };
   }
   ```
2. **Add global handlers** in `index.tsx`:
   ```typescript
   window.addEventListener('unhandledrejection', (event) => {
     handleError(event.reason, 'Unhandled promise rejection');
   });
   ```
3. **Add React error boundaries** around: GraphBuilder, PromptDesigner, SettingsModal,
   PluginsOverlay. Each shows a "Something went wrong" UI instead of white-screening.
4. **Remove `swallowPromise()`** - replace all call sites with `wrapAsync()`.

**Risks**:
- Adding error boundaries can mask bugs during development. In dev mode, boundaries
  should re-throw so errors appear in the console. Use `process.env.NODE_ENV` to toggle.
- The fire-and-forget patterns may be intentional in some cases (e.g., analytics, logging).
  Audit each instance before wrapping.
- `toast.error()` can flood the screen if many errors fire at once (e.g., during network
  outage). Add deduplication: don't toast the same error message within 5 seconds.

---

### 19. ~~Consolidate serialization backward compatibility~~ DONE (verified)

**Effort: M | Impact: Low-Medium**

4 serialization versions. V3 (243 lines) and V4 (333 lines) share ~80% structure
(verified: identical connection format, near-identical node serialization, same YAML output).
Deserialization uses nested try-catch waterfall:

```typescript
try { return v4Deserializer(data); }
catch { try { return v3Deserializer(data); }
  catch { try { return v2Deserializer(data); }
    catch { try { return v1Deserializer(data); }
      catch { throw new Error('Could not deserialize project'); }
    }
  }
}
```

**Fix**:
1. Add explicit version detection at the top of deserialization:
   ```typescript
   function detectVersion(data: unknown): 1 | 2 | 3 | 4 {
     if (typeof data === 'string') {
       const parsed = YAML.parse(data);
       if (parsed?.version === 4) return 4;
       if (parsed?.version === 3) return 3;
     }
     if (typeof data === 'object' && 'version' in data) return data.version;
     // V1/V2: try JSON parse, check structure
     return 1;
   }
   ```
2. Extract shared V3/V4 logic into a base serializer:
   ```typescript
   function toSerializedNodeBase(node: ChartNode): BaseSerializedNode { ... }  // shared 80%
   function toSerializedNodeV4(node: ChartNode): V4SerializedNode {
     return { ...toSerializedNodeBase(node), disabled, isConditional, color };
   }
   ```
3. Consider providing a `rivet migrate <project-file>` CLI command that upgrades V1-V3
   files to V4 in place, so the deserializers can eventually be removed.

**Risks**:
- Changing deserialization logic could break loading of old project files. Must test with
  sample files from each version. Create test fixtures for V1, V2, V3, V4 formats.
- The YAML-based formats (V3/V4) use string matching that's sensitive to whitespace.
  Refactoring the shared serializer must preserve exact output format for round-trip
  compatibility.
- If users have V1/V2 files in production, removing those deserializers (even with a
  migration tool) needs a deprecation period and clear messaging.

---

## Tier 3: Major Refactors (Large effort, critical impact)

These are multi-week efforts that address fundamental architectural issues.

---

### 20. ~~Split GraphProcessor into focused modules~~ DONE (verified)

**Effort: L | Impact: Critical**

`GraphProcessor.ts` is ~1900 lines with 8 distinct responsibilities, 22 private methods,
and 30+ private fields. It handles:

1. Graph execution orchestration
2. Node dependency resolution
3. Control flow management (if/else, loops, races)
4. Event emission (25+ event types)
5. Cycle detection (Tarjan's SCC algorithm)
6. Recording playback (~190 lines)
7. Process context construction (~200 lines)
8. Sub-processor management

**Proposed decomposition**:

```
GraphProcessor.ts (400-500 lines, orchestration only)
├── GraphPreprocessor.ts      - Graph validation, IO def loading, cycle detection
├── NodeScheduler.ts          - Dependency resolution, execution ordering, loop detection
├── ControlFlowResolver.ts    - Conditional exclusion, loop/race propagation, marking excluded
├── ProcessContextBuilder.ts  - Building InternalProcessContext per node, subprocessor event wiring
├── SplitRunProcessor.ts      - Split/parallel execution strategy (sequential vs concurrent)
├── CycleDetector.ts          - Tarjan's SCC algorithm (pure function, no class needed)
└── RecordingPlayer.ts        - Execution recording replay (the replayRecording method)
```

**Implementation approach**:
1. Start by extracting `CycleDetector.ts` (pure algorithm, no dependencies, easy to test).
2. Then `RecordingPlayer.ts` (self-contained ~190 line method).
3. Then `ProcessContextBuilder.ts` (the ~200 line context construction).
4. Then `ControlFlowResolver.ts` and `NodeScheduler.ts` (tightly coupled, do together).
5. Finally clean up `GraphProcessor.ts` to be a thin orchestrator.

Each extracted module gets its own test file. The orchestrator keeps the public API
(`processGraph`, `abort`, `pause`, `resume`, event emitter).

**Risks**:
- The 30+ private fields (`#nodeResults`, `#visitedNodes`, `#erroredNodes`, etc.) are
  shared mutable state. Extracted modules need access to this state. Options:
  (a) Pass a shared `ExecutionState` object, (b) keep state in GraphProcessor and pass
  to modules per-call. Option (a) is cleaner but creates a new class; option (b) creates
  long parameter lists.
- The event emitter is used throughout all modules. Either pass it as a dependency or
  have modules return results that the orchestrator emits.
- This is the highest-risk refactor in the plan. Do it after Item 22 (tests) so you have
  a safety net. At minimum, ensure the existing 7 tests pass at every extraction step.

---

### 21. ~~Decompose monolithic components~~ DONE (verified)

**Effort: L | Impact: High**

Five components exceed 680 lines:

| Component | Lines | Atoms Read | Props | Key Issues |
|-----------|-------|------------|-------|------------|
| PromptDesigner | 1,101 | 14 | 1 | GraphProcessor usage inline, test execution mixed with rendering, 3 inline custom hooks |
| GraphList | 901 | - | - | Mixed concerns |
| NodeCanvas | 889 | 18 | 8 | 16+ hooks called, viewport math, throttled event handling |
| VisualNode | 815 | 9 | 28 | Massive prop drilling, two rendering modes (zoomed/normal) |
| SettingsModal | 682 | 14 | 0 | Multiple settings pages defined in same file |

**Fix strategy per component**:

**PromptDesigner** (1,101 → ~3 files):
- `PromptDesignerTestRunner.ts` - Extract `useRunTestGroup()` and `useRunTestGroupSampleCount()`
  hooks and test execution logic (~200 lines)
- `PromptDesignerChat.tsx` - Message list display + input area (~400 lines)
- `PromptDesignerConfig.tsx` - Configuration panel and controls (~200 lines)
- `PromptDesigner.tsx` - Tab container that composes the above (~300 lines)

**NodeCanvas** (889 → canvas + hooks):
- Extract `useCanvasEventHandlers.ts` - mouse move, click, scroll handlers (~200 lines)
- Extract `useNodeVisibility.ts` - viewport bounds calculation + node filtering (~100 lines)
- `NodeCanvas.tsx` becomes primarily a render function (~400 lines)

**VisualNode** (815 → separate rendering paths):
- `ZoomedOutNode.tsx` - Simplified rendering for far zoom (~150 lines)
- `NormalNode.tsx` - Full node rendering with ports and body (~300 lines)
- `VisualNode.tsx` - Dispatch to the right renderer (~100 lines)
- Combine with Item 15 (CanvasContext) to eliminate prop drilling

**SettingsModal** (682 → separate pages):
- Move each settings page to its own file: `GeneralSettingsPage.tsx`,
  `OpenAiSettingsPage.tsx`, `PluginsSettingsPage.tsx`, `CustomPluginsSettingsPage.tsx`
- `SettingsModal.tsx` becomes just the modal shell + tab navigation (~100 lines)

**Risks**:
- Components that read 14-18 Jotai atoms have implicit re-render coupling. Splitting into
  sub-components doesn't reduce re-renders unless atom reads are also redistributed.
  Each sub-component should only read the atoms it needs.
- PromptDesigner's inline hooks (`useRunTestGroup`, `useRunTestGroupSampleCount`) capture
  component-level state via closures. Extracting them requires converting closure variables
  to parameters, which may change their API surface.
- NodeCanvas has complex mouse event throttling. Extracting event handlers must preserve
  the throttle/debounce timing. Test canvas performance with 100+ nodes after extraction.

---

### 22. ~~Add comprehensive test coverage~~ DONE (verified)

**Effort: XL | Impact: Critical**

Current state:
- **7 test files** total across the entire monorepo
- **~7% of 84 core node types** tested (ArrayNode, ObjectNode, ExtractJsonNode,
  AbortGraphNode, plus GraphProcessor and ExecutionRecorder)
- **0% of app package** tested (0 tests out of 281 source files)
- **Test framework**: Node.js built-in `node:test` via tsx (NOT Vitest despite what
  was previously documented)
- No integration tests, no E2E tests, no component tests

**Phased approach**:

**Phase 1 - Core Node Tests (Weeks 1-2)**:
- Create a test harness that builds a minimal graph with one node, runs it, and asserts
  outputs. This exists partially in `GraphProcessor.test.ts` but needs generalization.
- Test all 84 node types with basic input→output verification (one test per node minimum).
- Test edge cases: missing inputs, wrong types, conditional execution, split runs.
- Test serialization round-trips: serialize V4 → deserialize → re-serialize → compare.
- **Framework decision**: Either stay on `node:test` (simpler, zero deps) or migrate to
  Vitest (better DX: watch mode, coverage, snapshots). Vitest needs to be added as a
  dev dependency - it's NOT currently installed despite the PACKAGES.md claim.

**Phase 2 - GraphProcessor Tests (Weeks 3-4)**:
- Test execution flows: linear chains, branching (if/else), loops, races, split runs.
- Test cycle detection with intentionally cyclic graphs.
- Test abort/pause/resume behavior.
- Test subgraph execution (SubGraphNode, CallGraphNode).
- Test error propagation (one node errors → downstream nodes skip).

**Phase 3 - Integration Tests (Weeks 5-6)**:
- Test WebSocket protocol (mock executor ↔ app communication).
- Test plugin loading (built-in, URI mock, package mock).
- Test project save → close → reopen → verify identical state.
- Test the serialization backward compatibility (load V1/V2/V3 files, verify content).

**Phase 4 - App Tests (Weeks 7-10)**:
- Add component tests for critical UI: NodeCanvas rendering, VisualNode rendering,
  wire drawing, node selection, undo/redo.
- Test critical hooks: useCurrentExecution, useLocalExecutor, useRemoteExecutor.
- Test Jotai atom computations (derived atoms, atomFamily behavior, storage persistence).
- Add Playwright E2E tests for core workflows: create project, add nodes, connect them,
  execute graph, verify output.

**Risks**:
- Writing tests for 84 nodes is tedious but necessary. Consider code generation: parse
  each node's `create()` method to auto-generate the basic test scaffold.
- Testing GraphProcessor requires building graph fixtures. Create a test utility
  `buildTestGraph()` that provides a fluent API for constructing graphs in tests.
- App tests require mocking Tauri APIs. If Item 13 (Tauri decoupling) isn't done first,
  every component test needs Tauri mocks. Do Item 13 first, then app tests become simpler.
- E2E tests with Playwright + Tauri require `tauri-driver` or running the Vite dev server
  in browser mode. The browser mode path (without Tauri) is easier to set up but doesn't
  test Tauri-specific features.

---

### 23. ~~Restructure state management for separation of concerns~~ DONE (verified)

**Effort: L | Impact: High**

Current state: 71 atoms across 16 files. Business logic (try-catch error handling,
O(n) node iteration) mixed with atom definitions. Complex derived atoms with 5+
dependencies. Storage logic (193 lines of IndexedDB/localStorage/migration code in
`storage.ts`) mixed into state module. Functions stored in atoms (`userInputModalSubmitState`
stores a callback - anti-pattern).

**Proposed structure**:

```
state/
├── atoms/                    # Pure atom definitions (shape only, minimal logic)
│   ├── graph.ts             # graphState, nodesState, connectionsState
│   ├── project.ts           # projectState, loadedProjectState, pluginsState
│   ├── execution.ts         # graphRunningState, graphPausedState, runningGraphsState
│   ├── ui.ts                # Modal/overlay/sidebar state, selection, dragging
│   └── settings.ts          # All user preferences
├── selectors/               # Derived/computed atoms (read-only)
│   ├── graphSelectors.ts    # nodesByIdState, connectionsForNodeState, nodesForConnectionState
│   ├── nodeSelectors.ts     # Per-node atomFamilies (nodeByIdState, nodeInstanceByIdState)
│   ├── ioDefinitions.ts     # ioDefinitionsForNodeState (per-node, not global)
│   └── executionSelectors.ts # lastRunDataState, selectedProcessPageState
├── actions/                 # State mutation logic (write-only atoms or setter functions)
│   ├── graphActions.ts      # addNode, deleteNode, editNode (integrate with commands)
│   ├── executionActions.ts  # startExecution, stopExecution, clearResults
│   └── projectActions.ts    # loadProject, saveProject, switchGraph
└── storage/                 # Persistence layer (extracted from state/)
    ├── indexedDB.ts         # IndexedDBStorage class (~80 lines from current storage.ts)
    ├── hybridStorage.ts     # Memory + async storage bridge (~50 lines)
    └── migrations.ts        # Storage format migrations
```

**Key changes**:
1. Move `storage.ts` internals (IndexedDBStorage, migration logic, toast error handling)
   into `storage/` directory - state files only import the final `createHybridStorage()`.
2. Move derived atoms out of `graph.ts` into `selectors/` - `graph.ts` keeps only the
   root atoms (`graphState`, `nodesState`, `connectionsState`).
3. Replace `userInputModalSubmitState` (function in atom) with a callback ref pattern:
   the modal component receives a submit handler via props or context, not global state.
4. Move node instance creation logic (try-catch in `nodeInstancesState`) to a selector
   that handles errors explicitly.

**Risks**:
- This restructure touches every file that imports from `state/`. The migration must be
  done in stages: (1) create new directory structure, (2) move one file at a time with
  re-exports from the old location, (3) update imports gradually, (4) remove re-exports.
- Jotai atoms are singletons - moving them between files doesn't change behavior as long
  as import paths are updated. But if two files accidentally create duplicate atoms with
  the same key, storage will conflict.
- The `actions/` layer introduces a new pattern that doesn't exist today. It needs
  clear guidelines: when to use actions vs. direct atom updates. Without discipline,
  the team may bypass actions and update atoms directly, defeating the purpose.

---

## Summary Matrix

| # | Issue | Effort | Impact | Tier |
|---|-------|--------|--------|------|
| 1 | Fix circular dependency (barrel imports) | S | Medium | Quick Win |
| 2 | Split IOProvider interface | S | Medium | Quick Win |
| 3 | Remove redundant selectedExecutorState | S | Low | Quick Win |
| 4 | Move WebSocket out of Jotai | S | Medium | Quick Win |
| 5 | Add project file validation | S | Medium | Quick Win |
| 6 | Surface plugin load failures | S | Medium | Quick Win |
| 7 | Clean up `as any` casts | S-M | Medium | Quick Win |
| 8 | Eliminate global singletons (4 files) | S | Medium | Quick Win |
| 9 | Inject GraphProcessor dependencies | S | Medium | Quick Win |
| 10 | De-duplicate GraphProcessor patterns | S | Medium | Quick Win |
| 11 | Break up largest GraphProcessor methods | M | High | Strategic |
| 12 | Type the WebSocket protocol | M | High | Strategic |
| 13 | Decouple from Tauri (22 files) | M | High | Strategic |
| 14 | Break up useCurrentExecution (19 methods) | M | High | Strategic |
| 15 | Reduce VisualNode prop drilling (28 props) | M | High | Strategic |
| 16 | Optimize ioDefinitionsState | M | High | Strategic |
| 17 | Add atomFamily cleanup (8 families) | M | Medium | Strategic |
| 18 | Standardize error handling | M | Medium | Strategic |
| 19 | Consolidate serialization versions | M | Low-Med | Strategic |
| 20 | Split GraphProcessor into modules | L | Critical | Major |
| 21 | Decompose monolithic components | L | High | Major |
| 22 | Add comprehensive test coverage | XL | Critical | Major |
| 23 | Restructure state management | L | High | Major |

---

## Recommended Execution Order

**Start with Tier 1** (items 1-10): These are safe, isolated changes that improve code
quality immediately and build momentum. They can be done independently and in parallel.
Total estimated effort: ~1-2 weeks.

**Then Tier 2** (items 11-19): These require more planning but each delivers significant
improvement. Items 12 and 13 (WebSocket protocol + Tauri decoupling) are **prerequisites
for the web-hosted version**. Total estimated effort: ~4-6 weeks.

**Finally Tier 3** (items 20-23): These are architectural changes that touch many files.
Item 22 (testing) should start in parallel with everything else - write tests as you
refactor. Items 20 and 21 benefit enormously from having tests in place first.
Total estimated effort: ~8-12 weeks.

**Critical path for web version**: Items 2 → 8 → 13 → 12 (IOProvider split → eliminate
singletons → Tauri decoupling → typed WebSocket protocol).

**Dependency graph between items**:
```
Item 10 (de-duplicate) → Item 11 (break up methods) → Item 20 (split GraphProcessor)
Item 2 (IOProvider) → Item 13 (Tauri decoupling)
Item 8 (singletons) → Item 13 (Tauri decoupling)
Item 22 (tests) → Items 20, 21 (major refactors need safety net)
Item 15 (CanvasContext) → Item 21 (decompose components)
Item 16 (ioDefinitions) → Item 17 (atomFamily cleanup)
```
