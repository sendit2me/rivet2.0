# Add Code Folding To Targeted Built-In Node Editors

## Summary

Add Monaco code folding support in the node editor side panel for the built-in nodes that have actual code/JSON-style configuration fields, while leaving prompt-like, markdown-like, JSONPath, regex, and non-node Monaco editors unchanged.

This is intentionally a scoped node-editor feature, not a global Monaco behavior change.

The important architectural fact in the current codebase is that Monaco editors are created once in [`packages/app/src/components/CodeEditor.tsx`](packages/app/src/components/CodeEditor.tsx), and node editor fields only reach that base editor through [`packages/app/src/components/editors/CodeEditor.tsx`](packages/app/src/components/editors/CodeEditor.tsx). The current base editor does not recreate itself when language-level structural options change, so the folding plan must handle both:

- enabling folding only for the selected built-in node fields
- making sure a node switch cannot leave a reused Monaco instance in the wrong language/folding mode

## Built-In Node Inventory

### In scope: core built-in nodes

These node editor fields should get folding enabled:

- `Code`
  - `Code` (`javascript`)
- `Object`
  - `JSON Template` (`json`)
- `HTTP Call`
  - `Headers` (`json`)
  - `Body` (`json`)
- `Tool`
  - `Schema` (`json`)
- `MCP Tool Call`
  - `Tool Arguments` (`json`)
- `MCP Get Prompt`
  - `Prompt Arguments` (`json`)

### In scope: bundled built-in plugin nodes

These bundled built-in plugin node editor fields should also get folding enabled:

- `Transcribe Audio` (AssemblyAI built-in plugin)
  - `Transcript Parameters (JSON)` (`json`)

### Explicitly out of scope for this feature

These use Monaco today but should remain unchanged:

- prompt/markdown/plain-text node editors:
  - `Text.Text`
  - `Prompt.Prompt Text`
  - `Comment.Text`
  - `Chat Loop.User Prompt`
  - `Join.Join String`
  - `Split.Delimiter`
  - `To Tree.Format`
  - `User Input.Prompt`
  - `Tool.Description`
  - `Create Assistant.Instructions`
  - `Run Thread.Instructions`
  - `Thread Message.Text`
- adjacent but excluded editor types:
  - `Extract Object Path.Path` (`jsonpath`)
  - `Extract YAML.Object Path` (`jsonpath`)
  - `Extract Regex.Regex` (`regex`)
- non-node Monaco surfaces:
  - Trivet editors
  - dataset table editors
  - project MCP configuration
  - community template/version editors
  - copy-as-test-case modal
  - user input modal

## Important API / Type Changes

No saved-project format, runtime protocol, or node-execution behavior changes.

Add a backward-compatible editor-definition opt-in in [`packages/core/src/model/EditorDefinition.ts`](packages/core/src/model/EditorDefinition.ts):

```ts
type CodeEditorDefinition<T extends ChartNode> = SharedEditorDefinitionProps<T> & {
  type: 'code';
  dataKey: DataOfType<T, string>;
  useInputToggleDataKey?: DataOfType<T, boolean>;
  language: string;
  theme?: string;
  height?: number;
  enableFolding?: boolean;
};
```

Add matching app-side props:

```ts
type MonacoCodeEditorProps = {
  ...
  enableFolding?: boolean;
};
```

Defaults:

- `enableFolding` defaults to `false`
- only the targeted built-in node editor definitions set it to `true`

## Implementation

### 1. Add an explicit folding opt-in to code editor definitions

In [`packages/core/src/model/EditorDefinition.ts`](packages/core/src/model/EditorDefinition.ts):

- add optional `enableFolding?: boolean` to `CodeEditorDefinition<T>`
- do not change any other editor-definition types
- keep the default behavior unchanged for any editor definition that does not set the flag

Why this is the right boundary:

- it matches the requested built-in-only scope
- it avoids accidentally changing external project-plugin editors
- it supports field-level decisions within the same node, for example:
  - `Tool.Schema` should fold
  - `Tool.Description` should not

### 2. Add pure helpers for Monaco create options and node-editor editor identity

Create a small pure helper module adjacent to the base editor, for example:

- [`packages/app/src/components/codeEditorOptions.ts`](packages/app/src/components/codeEditorOptions.ts)

This helper module should export:

```ts
buildCodeEditorCreateOptions(args): monaco.editor.IStandaloneEditorConstructionOptions
getNodeEditorCodeEditorMountKey(args): string
```

`buildCodeEditorCreateOptions(...)` must:

- take `theme`, `language`, `text`, `readOnly`, `scrollBeyondLastLine`, and `enableFolding`
- return the exact `monaco.editor.create(...)` option bag
- keep existing editor defaults unchanged except for folding-related options

When `enableFolding === true`, it must include:

```ts
folding: true
foldingStrategy: 'auto'
showFoldingControls: 'mouseover'
foldingHighlight: true
unfoldOnClickAfterEndOfLine: false
```

When `enableFolding === false`, it must preserve:

```ts
folding: false
```

and must not enable folding-only UI options.

`getNodeEditorCodeEditorMountKey(...)` must include enough structural identity to force a clean Monaco remount for node-editor use:

- `node.id`
- field identity (`editor.dataKey` or the `name` prop passed into the wrapper)
- `language`
- `theme`
- `enableFolding`

Reason for this helper:

- the repo’s app test suite is mostly pure `node:test` units, not DOM-heavy component tests
- the original plan’s “test the React component with Monaco in jsdom” assumption is not aligned with the current test harness
- extracting pure helpers gives the implementation a testable seam

### 3. Thread the folding flag through the node-editor wrapper path only

In [`packages/app/src/components/editors/CodeEditor.tsx`](packages/app/src/components/editors/CodeEditor.tsx):

- pass `editor.enableFolding ?? false` into the wrapper `CodeEditor`
- compute `isEditorReadOnly = isReadonly || isDisabled` once and use it consistently
- stop diverging between mount-time read-only and later update-time read-only
- pass a structural remount key to `LazyCodeEditor` using `getNodeEditorCodeEditorMountKey(...)`

The remount key is required because the current base Monaco editor is create-once. Without a structural remount boundary, switching nodes can reuse the old Monaco instance with stale language/folding configuration.

This remount behavior is intentionally limited to node-editor usage. Do not add the same remount policy to unrelated non-node Monaco consumers in this pass.

### 4. Add Monaco folding support to the shared base editor, but keep it opt-in

In [`packages/app/src/components/CodeEditor.tsx`](packages/app/src/components/CodeEditor.tsx):

- add `enableFolding?: boolean`
- keep the default `false`
- replace the inline `monaco.editor.create(...)` options object with `buildCodeEditorCreateOptions(...)`
- do not change non-folding behavior for existing callers

Keep all existing non-folding defaults unchanged:

- `lineNumbers: 'on'`
- `glyphMargin: false`
- `lineNumbersMinChars: 2`
- `minimap.enabled: false`
- `wordWrap: 'on'`
- existing resize/layout behavior
- existing blur/change wiring

Important behavior choices:

- folding is available even when the node editor is read-only
- no custom fold/unfold toolbar is added
- fold state is local to the mounted editor instance and is not persisted across close/reopen
- do not expand this base component’s behavior to non-node surfaces beyond honoring the new optional prop

### 5. Opt in only the targeted built-in node fields

Set `enableFolding: true` on these editor definitions and nowhere else.

#### Core nodes

- [`packages/core/src/model/nodes/CodeNode.ts`](packages/core/src/model/nodes/CodeNode.ts)
  - `Code`
- [`packages/core/src/model/nodes/ObjectNode.ts`](packages/core/src/model/nodes/ObjectNode.ts)
  - `JSON Template`
- [`packages/core/src/model/nodes/HttpCallNode.ts`](packages/core/src/model/nodes/HttpCallNode.ts)
  - `Headers`
  - `Body`
- [`packages/core/src/model/nodes/ToolNode.ts`](packages/core/src/model/nodes/ToolNode.ts)
  - `Schema` only
- [`packages/core/src/model/nodes/MCPToolCallNode.ts`](packages/core/src/model/nodes/MCPToolCallNode.ts)
  - `Tool Arguments`
- [`packages/core/src/model/nodes/MCPGetPromptNode.ts`](packages/core/src/model/nodes/MCPGetPromptNode.ts)
  - `Prompt Arguments`

#### Bundled built-in plugin nodes

- [`packages/core/src/plugins/assemblyAi/TranscribeAudioNode.ts`](packages/core/src/plugins/assemblyAi/TranscribeAudioNode.ts)
  - `Transcript Parameters (JSON)`

Do not set `enableFolding` on any other current code editor definitions.

### 6. Do not expand scope to adjacent editor types in this pass

Leave these unchanged:

- markdown/prompt/plaintext editors
- `jsonpath` editors
- `regex` editors
- dynamic code editors
- custom editors that do not route through `CodeEditorDefinition`
- non-node Monaco editors

Reasons:

- this matches the requested “code-related and JSON-related fields” scope
- `jsonpath` and `regex` are adjacent, but they are not part of the selected scope
- the shared base editor is used widely, so the feature boundary needs to stay explicit

## Testing

### App-side pure helper tests

Add a pure test file for the new helper module, for example:

- [`packages/app/src/components/codeEditorOptions.test.ts`](packages/app/src/components/codeEditorOptions.test.ts)

Required cases:

- `buildCodeEditorCreateOptions(...)` returns `folding: false` when `enableFolding` is omitted
- `buildCodeEditorCreateOptions(...)` returns the expected folding options when `enableFolding: true`
- `buildCodeEditorCreateOptions(...)` preserves existing non-folding defaults such as `glyphMargin: false`, `wordWrap: 'on'`, and `lineNumbersMinChars: 2`
- `getNodeEditorCodeEditorMountKey(...)` changes when:
  - `node.id` changes
  - field identity changes
  - `language` changes
  - `enableFolding` changes
- `getNodeEditorCodeEditorMountKey(...)` stays stable when none of those structural inputs change

This replaces the weaker original test idea of relying on a DOM-heavy Monaco component test that the current app test harness is not set up for.

### Core/editor-definition scope tests

Add a core-side test file:

- [`packages/core/test/model/nodeEditorFoldingDefinitions.test.ts`](packages/core/test/model/nodeEditorFoldingDefinitions.test.ts)

Required positive cases:

- `Code.Code` exposes `enableFolding: true`
- `Object.JSON Template` exposes `enableFolding: true`
- `HTTP Call.Headers` and `HTTP Call.Body` expose `enableFolding: true`
- `Tool.Schema` exposes `enableFolding: true`
- `MCP Tool Call.Tool Arguments` exposes `enableFolding: true`
- `MCP Get Prompt.Prompt Arguments` exposes `enableFolding: true`
- `Transcribe Audio.Transcript Parameters (JSON)` exposes `enableFolding: true`

Required negative cases:

- `Tool.Description` remains unset / false
- `Text.Text` remains unset / false
- `Prompt.Prompt Text` remains unset / false
- `Comment.Text` remains unset / false
- `Extract Object Path.Path` remains unset / false
- `Extract YAML.Object Path` remains unset / false
- `Extract Regex.Regex` remains unset / false
- `Create Assistant.Instructions` remains unset / false
- `Run Thread.Instructions` remains unset / false
- `Thread Message.Text` remains unset / false

Important implementation detail for these tests:

- `MCPToolCallNode` and `MCPGetPromptNode` use async `getEditors(context)`, so the test must pass a minimal stub `RivetUIContext`
- bundled built-in plugin node tests should import the plugin node implementations directly from `packages/core/src/plugins/...`

## Manual Verification

### Positive cases

Open each of these nodes in the node editor and verify folding works:

- `Code`
- `Object`
- `HTTP Call`
- `Tool`
- `MCP Tool Call`
- `MCP Get Prompt`
- `Transcribe Audio`

For fields whose default value is empty or single-line, first paste a clearly foldable multiline sample:

- `HTTP Call.Headers`
  ```json
  {
    "Authorization": "Bearer token",
    "Nested": {
      "Enabled": true
    }
  }
  ```
- `HTTP Call.Body`
  ```json
  {
    "user": {
      "name": "Rivet",
      "role": "tester"
    }
  }
  ```
- `Transcribe Audio.Transcript Parameters (JSON)`
  ```json
  {
    "speaker_labels": true,
    "auto_highlights": true,
    "entity_detection": true
  }
  ```

Positive assertions:

- fold controls appear in the gutter on hover
- clicking fold collapses the region
- clicking unfold restores it
- the folded text remains editable after unfold
- the same targeted field still shows folding when the node editor is read-only

### Negative cases

Open these nodes and verify they do not gain folding UI in this pass:

- `Text`
- `Prompt`
- `Comment`
- `Join`
- `Split`
- `User Input`
- `Extract Object Path`
- `Extract YAML`
- `Extract Regex`
- `Create Assistant`
- `Run Thread`
- `Thread Message`

Also verify non-node Monaco surfaces are unchanged:

- Trivet test case editor
- project MCP configuration
- community editors
- copy-as-test-case modal

## Documentation / Follow-up

When implemented, update maintainer docs only if needed to mention:

- `CodeEditorDefinition.enableFolding` is an opt-in editor capability
- code folding is intentionally scoped to selected built-in node-editor fields, not all Monaco surfaces

A refactor-log entry is optional unless the implementation grows beyond this narrow editor capability.

## Assumptions and Defaults

- “When they are open” means the node editor side panel, not node bodies, output viewers, or modals.
- Folding is a node-editor-only capability in this pass.
- Fold state is not persisted across closing and reopening the node editor.
- No custom toolbar or explicit fold/unfold buttons are added.
- External project plugins do not receive folding automatically; they only get it if they later opt into `enableFolding`.
- `jsonpath`, `regex`, markdown, prompt-interpolation, and plain-text editors remain out of scope.
