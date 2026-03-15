# Plugin System

> Rivet's plugin system allows extending the IDE with custom node types,
> integrations, and configuration. Plugins can be built-in, loaded from URLs,
> or installed from npm packages.

## Plugin Interface (`RivetPlugin`)

```typescript
type RivetPlugin = {
  id: string                              // Unique plugin identifier
  name?: string                           // Human-readable display name

  // Register custom nodes
  register?: (register: (def: PluginNodeDefinition) => void) => void

  // Configuration schema (displayed in Settings)
  configSpec?: RivetPluginConfigSpecs
  configPage?: RivetPluginConfigPage      // UI grouping/sections

  // Context menu groups for node picker
  contextMenuGroups?: Array<{
    id: string
    label: string
  }>
}
```

## Plugin Configuration

Plugins can define configuration fields that appear in the Settings UI:

```typescript
type PluginConfigurationSpec =
  | StringPluginConfigurationSpec
  | SecretPluginConfigurationSpec
  | PluginConfigurationSpecBase<number>
  | PluginConfigurationSpecBase<boolean>

type StringPluginConfigurationSpec = {
  type: 'string' | 'secret'
  default?: string
  label: string
  description?: string
  helperText?: string
  pullEnvironmentVariable?: true | string  // Auto-load from env var
}
```

**Environment variable pull-through**: When `pullEnvironmentVariable` is set, the
plugin config will automatically read from the specified environment variable.
This is how API keys (like `OPENAI_API_KEY`) are typically configured.

Configuration values are accessible during execution via:
```typescript
context.getPluginConfig('configKey')  // In node process() method
```

## Custom Node Definition

```typescript
type PluginNodeDefinition<T extends ChartNode> = {
  impl: PluginNodeImpl<T>
  displayName: string
}

interface PluginNodeImpl<T extends ChartNode> {
  // Port definitions (can be dynamic based on config + connections)
  getInputDefinitions(
    data: T['data'],
    connections: NodeConnection[],
    nodes: Record<NodeId, ChartNode>,
    project: Project
  ): NodeInputDefinition[]

  getOutputDefinitions(
    data: T['data'],
    connections: NodeConnection[],
    nodes: Record<NodeId, ChartNode>,
    project: Project
  ): NodeOutputDefinition[]

  // Execution logic
  process(
    data: T['data'],
    inputData: Inputs,
    context: InternalProcessContext
  ): Promise<Outputs>

  // UI configuration
  getEditors(data: T['data'], context: RivetUIContext): EditorDefinition<T>[]
  getBody(data: T['data'], context: RivetUIContext): NodeBody | Promise<NodeBody>
  create(): T
  getUIData(context: RivetUIContext): NodeUIData
}
```

### Editor Definitions

Plugins define property editors for the node's settings panel. All editors share
common props (`label`, `helperMessage?`, `autoFocus?`, `hideIf?`, `disableIf?`).

There are **19 editor types** (defined in `EditorDefinition.ts`):

```typescript
type EditorDefinition<T extends ChartNode> =
  | StringEditorDefinition<T>            // 'string' - text input (with optional useInputToggle, placeholder, maxLength)
  | NumberEditorDefinition<T>            // 'number' - numeric input (min, max, step, allowEmpty)
  | ToggleEditorDefinition<T>            // 'toggle' - boolean toggle
  | DropdownEditorDefinition<T>          // 'dropdown' - select from options [{value, label}]
  | CodeEditorDefinition<T>              // 'code' - Monaco editor (language, theme, height)
  | ColorEditorDefinition<T>             // 'color' - color picker
  | CustomEditorDefinition<T>            // 'custom' - custom editor component (customEditorId)
  | GraphSelectorEditorDefinition<T>     // 'graphSelector' - pick a graph from the project
  | DataTypeSelectorEditorDefinition<T>  // 'dataTypeSelector' - pick a DataType
  | DatasetSelectorEditorDefinition<T>   // 'datasetSelector' - pick a DatasetId
  | AnyDataEditorDefinition<T>           // 'anyData' - generic data editor
  | FileBrowserEditorDefinition<T>       // 'fileBrowser' - file picker (DataRef + mediaType)
  | FilePathBrowserEditorDefinition<T>   // 'filePathBrowser' - file path string picker
  | DirectoryBrowserEditorDefinition<T>  // 'directoryBrowser' - directory path picker
  | ImageBrowserEditorDefinition<T>      // 'imageBrowser' - image picker (DataRef + mediaType)
  | KeyValuePairEditorDefinition<T>      // 'keyValuePair' - list of {key, value} pairs
  | StringListEditorDefinition<T>        // 'stringList' - list of strings
  | EditorDefinitionGroup<T>             // 'group' - collapsible group of nested editors
  | DynamicEditorDefinition<T>           // 'dynamic' - editor type resolved at runtime
```

Most editors support `useInputToggleDataKey` - a boolean data key that, when true,
hides the editor and exposes the value as an input port instead.

### NodeBody

The `getBody` method returns the text displayed on the node's body in the graph editor:

```typescript
type NodeBody = string | NodeBodySpec | NodeBodySpec[] | undefined

type NodeBodySpec = NodeBodySpecBase & (PlainNodeBodySpec | MarkdownNodeBodySpec | ColorizedNodeBodySpec)

type NodeBodySpecBase = {
  fontSize?: number
  fontFamily?: 'monospace' | 'sans-serif'
}

// Variants:
type PlainNodeBodySpec = { type?: 'plain', text: string }
type MarkdownNodeBodySpec = { type: 'markdown', text: string }
type ColorizedNodeBodySpec = { type: 'colorized', text: string, language: string, theme?: string }
```

> **Note**: `getBody` can also return `Promise<NodeBody>` for async body generation.

### NodeUIData

Controls how the node appears in the UI:

```typescript
type NodeUIData = {
  group: string | string[]       // Category in node picker
  contextMenuTitle?: string      // Override in context menu
  infoBoxTitle?: string          // Info panel title
  infoBoxBody?: string           // Info panel description
}
```

## Plugin Load Specs

Projects specify which plugins to load:

```typescript
type BuiltInPluginLoadSpec = {
  type: 'built-in'
  id: string
  name: string                // Human-readable name (required for built-ins)
}

type URIPluginLoadSpec = {
  type: 'uri'
  id: string
  uri: string                 // URL to dynamically import
}

type PackagePluginLoadSpec = {
  type: 'package'
  id: string
  package: string             // npm package name
  tag: string                 // npm dist-tag (e.g. "latest")
}

type PluginLoadSpec = BuiltInPluginLoadSpec | URIPluginLoadSpec | PackagePluginLoadSpec
```

## Plugin Loading Flow (in the App)

### 1. Built-in Plugins

```typescript
// Direct import from @ironclad/rivet-core
const plugin = rivetPlugins[spec.id];
globalRivetNodeRegistry.registerPlugin(plugin);
```

### 2. URI Plugins (Dynamic Import)

```typescript
// Load JavaScript module from URL
const module = await import(/* @vite-ignore */ spec.uri);
const plugin = module.default(Rivet);  // Plugin factory receives Rivet API
globalRivetNodeRegistry.registerPlugin(plugin);
```

### 3. Package Plugins (npm)

Installation flow:
1. Download from npm registry
2. Extract tarball via Tauri command (`extract_package_plugin_tarball`)
3. Run `npm install` for dependencies (via pnpm sidecar)
4. Load `dist/index.js` as ESM module
5. Cache in `~/.local/share/[app]/plugins/[package]-[tag]/`
6. Check for updates via semver comparison on subsequent loads

```typescript
async function loadPackagePlugin(spec: PackagePluginLoadSpec) {
  const pluginDir = await getPluginCacheDir(spec);

  if (!await isPluginCached(pluginDir)) {
    const tarball = await downloadFromNpm(spec.package, spec.tag);
    await extractTarball(tarball, pluginDir);
    await installDependencies(pluginDir);
  }

  const module = await import(path.join(pluginDir, 'dist/index.js'));
  return module.default(Rivet);
}
```

## Node Registration

All nodes (built-in + plugin) are tracked in `NodeRegistration`:

```typescript
class NodeRegistration<NodeTypes, Nodes> {
  // Register a built-in node
  register(definition: NodeDefinition<T>): NodeRegistration

  // Register a plugin node (associated with its plugin)
  registerPluginNode(definition: PluginNodeDefinition<T>, plugin: RivetPlugin): NodeRegistration

  // Register an entire plugin (calls plugin.register())
  registerPlugin(plugin: RivetPlugin): void

  // Factory methods
  create(type: NodeTypes): ChartNode          // Create node data
  createImpl(node: ChartNode): NodeImpl       // Create node implementation
  createDynamicImpl(node: ChartNode): NodeImpl // For unknown types

  // Queries
  getDisplayName(type: NodeTypes): string
  isRegistered(type: NodeTypes): boolean
  getNodeTypes(): NodeTypes[]
  getPlugins(): RivetPlugin[]
}
```

The global singleton:
```typescript
export const globalRivetNodeRegistry = registerBuiltInNodes(new NodeRegistration())
```

## Writing a Plugin (Quick Guide)

### 1. Create Plugin Entry Point

```typescript
// index.ts
import type { RivetPlugin, RivetPluginInitializer } from '@ironclad/rivet-core';

const plugin: RivetPluginInitializer = (rivet) => {
  const myPlugin: RivetPlugin = {
    id: 'my-plugin',
    name: 'My Plugin',

    configSpec: {
      apiKey: {
        type: 'secret',
        label: 'API Key',
        description: 'Your API key',
        pullEnvironmentVariable: 'MY_API_KEY',
      },
    },

    register: (register) => {
      register(myCustomNode(rivet));
    },

    contextMenuGroups: [
      { id: 'my-plugin', label: 'My Plugin' },
    ],
  };

  return myPlugin;
};

export default plugin;
```

### 2. Define a Custom Node

```typescript
function myCustomNode(rivet: typeof import('@ironclad/rivet-core')) {
  return {
    impl: {
      create() {
        return {
          id: rivet.newId<NodeId>(),
          type: 'myCustomNode',
          title: 'My Custom Node',
          data: { prompt: '' },
          visualData: { x: 0, y: 0, width: 250 },
        };
      },

      getInputDefinitions() {
        return [
          { id: 'input' as PortId, title: 'Input', dataType: 'string' },
        ];
      },

      getOutputDefinitions() {
        return [
          { id: 'output' as PortId, title: 'Output', dataType: 'string' },
        ];
      },

      async process(data, inputs, context) {
        const input = rivet.coerceType(inputs['input'], 'string');
        const apiKey = context.getPluginConfig('apiKey');

        // Your logic here
        const result = await doSomething(input, apiKey);

        return { output: { type: 'string', value: result } };
      },

      getEditors() {
        return [
          { type: 'string', dataKey: 'prompt', label: 'Prompt Template' },
        ];
      },

      getBody(data) {
        return rivet.dedent`Prompt: ${data.prompt}`;
      },

      getUIData() {
        return {
          group: ['My Plugin'],
          contextMenuTitle: 'My Custom Node',
          infoBoxTitle: 'My Custom Node',
          infoBoxBody: 'Does something custom.',
        };
      },
    },
    displayName: 'My Custom Node',
  };
}
```

### 3. Package as npm Module

```json
{
  "name": "rivet-plugin-my-plugin",
  "main": "dist/index.js",
  "type": "module",
  "peerDependencies": {
    "@ironclad/rivet-core": "^1.0.0"
  }
}
```

### 4. Add to Project

In the Rivet app, go to **Project → Plugins** and add:
- **Package**: `rivet-plugin-my-plugin`
- **Tag**: `latest`

Or for development, use URI loading:
- **URI**: `http://localhost:3000/dist/index.js`

## Plugin Settings in Project

Plugin settings are stored in the project file:

```json
{
  "metadata": { ... },
  "plugins": [
    { "type": "package", "package": "rivet-plugin-example", "tag": "latest", "id": "example" }
  ],
  "graphs": { ... }
}
```

Runtime plugin settings (like API keys) are stored in the app's settings,
not in the project file, to avoid accidentally committing secrets.

## Limitations & Considerations

- Plugin nodes must have globally unique `type` strings
- Plugins receive the full `InternalProcessContext` during execution
- Plugin configuration values can be pulled from environment variables
- Package plugins are cached locally and checked for updates on load
- URI plugins are re-fetched on every project load (no caching)
- Built-in plugins are always available, no installation needed
