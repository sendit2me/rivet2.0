# Phase 0 Spike: Validate Vercel AI SDK in Rivet

## Goal
Prove that the Vercel AI SDK can slot into Rivet's core package — message conversion, tool conversion, and streaming bridge — without breaking the existing dual ESM/CJS build, Vite dev server, or existing tests.

---

## Step 0: Install Dependencies

Add to `packages/core/package.json`:
```
ai@^6  @ai-sdk/openai@^3  @ai-sdk/anthropic@^3  @ai-sdk/google@^3  zod@^3.25
```

All ship dual ESM+CJS. Core's esbuild uses `packages: 'external'`, so no alias needed.

---

## Step 1: Message Conversion — `packages/core/src/model/chat/aiSdkMessages.ts`

Convert Rivet `ChatMessage[]` → AI SDK `CoreMessage[]`:

| Rivet type | AI SDK role | Notes |
|---|---|---|
| `system` | `system` | String-only content |
| `user` (text) | `user` | `TextPart` |
| `user` (image) | `user` | `ImagePart` with base64 data URL |
| `user` (url image) | `user` | `ImagePart` with URL |
| `user` (document) | `user` | `FilePart` with base64 data URL |
| `assistant` | `assistant` | Text + optional `ToolCallPart[]` from `function_calls` |
| `function` | `tool` | `ToolResultPart` with `toolCallId` = message.name |

Export: `async function rivetMessagesToAiSdk(messages: ChatMessage[]): Promise<CoreMessage[]>`

---

## Step 2: Tool Conversion — `packages/core/src/model/chat/aiSdkTools.ts`

Convert Rivet `GptFunction[]` → AI SDK tool map `Record<string, CoreTool>`:

```ts
import { jsonSchema } from 'ai';

export function rivetToolsToAiSdk(functions: GptFunction[]): Record<string, CoreTool> {
  return Object.fromEntries(
    functions.map(fn => [fn.name, {
      description: fn.description,
      parameters: jsonSchema(fn.parameters as JSONSchema7),
    }])
  );
}
```

Uses `jsonSchema()` (not Zod) since Rivet tools are already JSON Schema objects.

---

## Step 3: Streaming Bridge — `packages/core/src/model/chat/aiSdkStreaming.ts`

Bridge AI SDK `streamText().fullStream` → Rivet's `onPartialOutputs` pattern:

```ts
export async function consumeAiSdkStream(
  fullStream: AsyncIterable<TextStreamPart<any>>,
  onPartialOutputs: (text: string, functionCalls: StreamedFunctionCall[]) => void,
): Promise<{ responseText: string; functionCalls: StreamedFunctionCall[]; tokenUsage: { ... } }>
```

Iterates stream parts:
- `text-delta` → accumulate text, call `onPartialOutputs`
- `tool-call` → accumulate function calls
- `finish` → capture token usage from `usage`

Returns final accumulated result.

---

## Step 4: Unit Tests — `packages/core/test/model/chat/aiSdkConversion.test.ts`

Using `node:test` + `node:assert` (project convention):

1. **system message** → CoreMessage with role `system`
2. **user text** → CoreMessage with `TextPart`
3. **user image (inline)** → CoreMessage with `ImagePart` base64 data URL
4. **user image (URL)** → CoreMessage with `ImagePart` URL
5. **assistant with tool calls** → CoreMessage with `ToolCallPart[]`
6. **function response** → CoreMessage with role `tool`
7. **tool conversion** → `GptFunction[]` to `Record<string, CoreTool>` with JSON schema
8. **empty messages array** → empty result

---

## Step 5: Streaming Bridge Tests — `packages/core/test/model/chat/aiSdkStreaming.test.ts`

Mock `fullStream` as an async generator yielding:
- Multiple `text-delta` parts
- A `tool-call` part
- A `finish` part with usage

Assert:
- `onPartialOutputs` called with progressive text accumulation
- Final result has complete text, function calls, and token usage
- Abort mid-stream returns partial results gracefully

---

## Step 6: Build Validation

Run in sequence to confirm nothing breaks:
1. `yarn workspace @ironclad/rivet-core build:esm` — ESM output
2. `yarn workspace @ironclad/rivet-core build:cjs` — CJS output
3. `yarn workspace @ironclad/rivet-app build` — Vite app build
4. Existing core tests still pass

---

## Step 7 (Optional): Live API Smoke Test

`packages/core/test/model/chat/aiSdkLiveSmoke.test.ts`

Skips unless `OPENAI_API_KEY` is set. Sends a simple "say hello" prompt through AI SDK `streamText` → streaming bridge → validates output text is non-empty.

---

## Success Criteria

- All conversion modules compile in both ESM and CJS
- Unit tests pass for all message types
- Streaming bridge correctly accumulates text + tool calls
- Vite app builds without errors
- Existing tests remain green
- No runtime errors in browser context (validated by Vite build)

## Files Created

| File | Purpose |
|---|---|
| `packages/core/src/model/chat/aiSdkMessages.ts` | Message conversion |
| `packages/core/src/model/chat/aiSdkTools.ts` | Tool conversion |
| `packages/core/src/model/chat/aiSdkStreaming.ts` | Streaming bridge |
| `packages/core/test/model/chat/aiSdkConversion.test.ts` | Conversion tests |
| `packages/core/test/model/chat/aiSdkStreaming.test.ts` | Streaming tests |
| `packages/core/test/model/chat/aiSdkLiveSmoke.test.ts` | Optional live test |
