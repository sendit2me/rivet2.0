# Refactor: LLM/Chat Provider System — Revised Strategy v2

## Executive Summary

The original plan focused on deduplicating the existing 4 provider nodes through shared infrastructure. After researching the **latest API specs** (OpenAI Responses API, Anthropic Messages API with extended thinking, Google Gemini 2.5 with thinking), the **Vercel AI SDK** as a potential abstraction layer, and Rivet's **node versioning constraints**, the strategy has fundamentally changed.

**The recommendation is: create new v2 Chat nodes backed by the Vercel AI SDK, while leaving existing nodes untouched for backward compatibility.**

---

## Why the Original Plan Is Insufficient

The original plan addressed code duplication but **did not account for**:

1. **OpenAI's paradigm shift**: The Responses API (`/v1/responses`) replaces Chat Completions with a fundamentally different model — `input` items instead of `messages`, server-side conversation state via `previous_response_id`, built-in tools (web search, file search, computer use, code interpreter), rich hierarchical streaming events, and automatic prompt caching. Refactoring the existing OpenAI node to support both APIs would be messy.

2. **Thinking/reasoning across all providers**: Each provider now has thinking support with different APIs:
   - **OpenAI**: `reasoning: { effort: "low"|"medium"|"high", summary: "auto"|"concise"|"detailed" }`
   - **Anthropic**: `thinking: { type: "enabled", budget_tokens: N }` (tokens visible in response)
   - **Google**: `thinkingConfig: { thinkingBudget: N, includeThoughts: boolean }`

3. **Token caching divergence**: Each provider caches differently:
   - **OpenAI**: Automatic prefix caching, reported in `usage.input_tokens_details.cached_tokens`
   - **Anthropic**: Explicit `cache_control: { type: "ephemeral" }` breakpoints, charged at 1.25x write / 0.1x read
   - **Google**: Explicit cache creation via API (`ai.caches.create()`), 75% discount, TTL-based

4. **Structured output**: Each has different mechanisms:
   - **OpenAI**: `text: { format: { type: "json_schema", schema: {...}, strict: true } }`
   - **Anthropic**: Tool-based approach (define a tool with the schema)
   - **Google**: `responseMimeType: "application/json"` + `responseSchema`

5. **Backward compatibility**: Rivet's node system has no versioning. Node types are unique strings — duplicates throw errors. Changing a node's data shape breaks existing `.rivet-project` files that reference it.

---

## Current API Feature Matrix

| Feature | OpenAI (Responses API) | Anthropic (Messages) | Google (Gemini) |
|---------|----------------------|---------------------|-----------------|
| **Thinking/Reasoning** | `reasoning.effort` + `reasoning.summary` | `thinking.budget_tokens` | `thinkingConfig.thinkingBudget` |
| **Token Caching** | Automatic prefix caching | Explicit `cache_control` breakpoints | Explicit cache creation API |
| **Tool Calling** | Function tools + built-in tools (web_search, file_search, computer_use, code_interpreter) | `tools` + `tool_choice` (auto/any/tool/none) | `functionDeclarations` + `toolConfig.mode` (AUTO/ANY/NONE) |
| **Structured Output** | `text.format.json_schema` (strict) | Via tool schema | `responseMimeType` + `responseSchema` |
| **Images** | `input_image` (URL or base64) | `image` (base64 or URL) | `inlineData` / `fileData` |
| **Documents/PDF** | `input_file` (file_id or base64) | `document` (base64, with citations) | `fileData` (PDF as page images) |
| **Audio Input** | `input_audio` (base64) | Not supported | `inlineData` (audio) |
| **Audio Output** | `audio` config (voice, format) | Not supported | Native (Gemini 2.5 Flash) |
| **Streaming** | Rich event hierarchy (`response.*`) | SSE: `message_start`, `content_block_*`, `message_delta` | SSE chunks with `candidates` |
| **Multi-turn State** | `previous_response_id` (server-side) | Manual (resend messages) | Manual / Chat sessions |
| **Citations** | Not built-in | `citations: { enabled: true }` on documents | `groundingMetadata` (Google Search) |
| **System Prompt** | `instructions` (top-level) | `system` (string or array with cache_control) | `systemInstruction` |
| **Stop Sequences** | `stop` | `stop_sequences` | `stopSequences` |
| **Penalties** | Not in Responses API (legacy only) | Not supported | `presencePenalty`, `frequencyPenalty` |
| **Seed** | Not in Responses API | Not supported | `seed` |
| **Token Counting** | Via usage in response | Separate `/count_tokens` endpoint | Via `usageMetadata` in response |
| **Background/Async** | `background: true` | Batch API (`/messages/batches`) | Not built-in |

---

## The Vercel AI SDK Option

### What It Is

The [Vercel AI SDK](https://sdk.vercel.ai) (`ai` package on npm) is a TypeScript-first, provider-agnostic toolkit. Architecture:

```
ai                    - Core: generateText, streamText, generateObject, streamObject
@ai-sdk/provider      - Provider interface (LanguageModelV1)
@ai-sdk/openai        - OpenAI provider
@ai-sdk/anthropic     - Anthropic provider
@ai-sdk/google        - Google provider
@ai-sdk/provider-utils - Shared utilities for building providers
```

### What It Normalizes

- **Messages**: Same format for all providers (system, user, assistant, tool roles)
- **Tool calling**: Zod schemas → JSON Schema → provider-native format, automatically
- **Streaming**: Unified stream events (`text-delta`, `tool-call`, `tool-call-delta`, `tool-result`, `finish`)
- **Token usage**: `{ promptTokens, completionTokens, totalTokens }` for all providers
- **Structured output**: `generateObject(schema)` works across providers
- **Multi-step tool use**: `maxSteps` handles autonomous tool loops

### How It Handles Provider-Specific Features

```typescript
const result = await generateText({
  model: anthropic('claude-sonnet-4-20250514'),
  prompt: 'Think about this...',
  // Provider-specific escape hatch:
  providerOptions: {
    anthropic: {
      thinking: { type: 'enabled', budgetTokens: 10000 },
    },
  },
});
// Provider-specific response data:
const thinking = result.providerMetadata?.anthropic?.thinking;
```

### Strengths for Rivet

1. **Eliminates provider transport code** — no more hand-rolled `fetch` + SSE parsing for each provider
2. **Tool calling normalization** — Rivet's `gpt-function` type maps cleanly to the SDK's tool format
3. **TypeScript-first** with full type inference
4. **Web Standards** (fetch, ReadableStream) — should work in Tauri's webview
5. **Active maintenance** — Vercel tracks API changes weekly
6. **~15+ providers** out of the box (OpenAI, Anthropic, Google, Mistral, Bedrock, Azure, Cohere, etc.)

### Concerns for Rivet

1. **Tool execution model mismatch**: SDK's `tool()` expects inline `execute` callbacks. Rivet executes tools via graph connections. **Mitigation**: Use tools *without* `execute` — the SDK returns tool calls, Rivet handles execution through graph wiring, then feeds results back.

2. **Streaming bridge**: SDK uses `ReadableStream` / async iterators. Rivet uses `context.onPartialOutputs()`. **Mitigation**: Simple adapter loop — iterate the stream, call `onPartialOutputs` on each chunk.

3. **No cost calculation**: SDK provides token counts but not dollar amounts. **Mitigation**: Keep Rivet's model registry for costs (already exists).

4. **Provider-specific UI**: Each provider has unique settings (thinking budget, cache breakpoints, citations). **Mitigation**: Provider-specific node sections that map to `providerOptions`.

5. **Browser/Tauri compatibility**: Needs verification. Provider packages use `fetch` which should work, but some may use Node.js APIs. **Mitigation**: Spike test before committing.

6. **External dependency risk**: Vercel ships breaking changes between majors. **Mitigation**: Pin versions, abstract behind Rivet's own interfaces.

---

## Recommended Strategy: v2 Chat Nodes + Vercel AI SDK

### Core Decision: New Nodes, Not Refactored Nodes

**Why new nodes instead of refactoring?**

1. **Rivet has no node versioning.** Node types are unique strings (`chat`, `chatAnthropic`, `chatGoogle`). Changing their data shape breaks all existing `.rivet-project` files that use them.

2. **The API paradigm has shifted.** OpenAI moved from Chat Completions to Responses API. Trying to support both in one node creates complexity, not removes it.

3. **Users need a migration path.** Old graphs should keep working. New graphs should use modern features. Both can coexist.

4. **The old nodes become "legacy".** They still work, receive critical bugfixes, but no new features. All new development goes into v2 nodes.

### Architecture

```
packages/core/src/
  model/chat-v2/                          # NEW: All v2 chat infrastructure
    aiSdkBridge.ts                        # Bridge between AI SDK and Rivet's execution model
    chatV2Types.ts                        # Shared types for v2 chat nodes
    chatV2Shared.ts                       # Shared input/output/editor builders
    chatV2Pipeline.ts                     # Shared process() orchestration
    providerConfigs.ts                    # Provider-specific config schemas
    modelRegistry.ts                      # Unified model registry with costs

  model/nodes/
    ChatNodeBase.ts                       # UNCHANGED (legacy OpenAI Chat Completions)
    ChatNodeV2.ts                         # NEW: v2 OpenAI node (Responses API)

  plugins/anthropic/
    anthropic.ts                          # UNCHANGED (legacy transport)
    nodes/ChatAnthropicNode.ts            # UNCHANGED (legacy)
    nodes/ChatAnthropicV2Node.ts          # NEW: v2 Anthropic node

  plugins/google/
    google.ts                             # UNCHANGED (legacy transport)
    nodes/ChatGoogleNode.ts               # UNCHANGED (legacy)
    nodes/ChatGoogleV2Node.ts             # NEW: v2 Google node

  plugins/huggingface/
    nodes/ChatHuggingFace.ts              # UNCHANGED (legacy)
    # No v2 — HuggingFace is text-gen only, covered by OpenAI-compatible providers
```

### Why Per-Provider v2 Nodes (Not One Unified Node)

I considered a single "Chat v2" node with a provider dropdown. Rejected because:

1. **Provider-specific inputs are too different.** Anthropic has `cache_control` breakpoints on individual messages. Google has `thinkingBudget` as a number. OpenAI has `reasoning.effort` as an enum + `reasoning.summary`. A single node's UI would be a mess of conditional fields.

2. **Rivet's UX pattern is per-provider nodes.** Users drag "Chat (Anthropic)" or "Chat (OpenAI)" from the sidebar. Changing this UX in v2 would confuse existing users.

3. **Testing and debugging is easier** when each provider is isolated.

4. **The shared infrastructure eliminates duplication anyway.** The v2 nodes are thin (~100-200 lines each) because the pipeline handles everything common.

### The AI SDK Bridge

The bridge is the key architectural piece. It adapts between Rivet's execution model and the AI SDK:

```typescript
// model/chat-v2/aiSdkBridge.ts

import { streamText, generateText, type CoreMessage, type CoreTool } from 'ai';
import type { LanguageModelV1 } from '@ai-sdk/provider';

export type RivetAiSdkOptions = {
  model: LanguageModelV1;
  messages: CoreMessage[];
  system?: string;
  tools?: Record<string, CoreTool>;
  maxTokens?: number;
  temperature?: number;
  topP?: number;
  topK?: number;
  stopSequences?: string[];
  providerOptions?: Record<string, Record<string, unknown>>;
  signal?: AbortSignal;
};

export type RivetStreamResult = {
  text: string;
  toolCalls: { id: string; name: string; arguments: string }[];
  usage: { promptTokens: number; completionTokens: number };
  providerMetadata: Record<string, Record<string, unknown>>;
  finishReason: string;
};

/**
 * Streams a chat completion through the AI SDK, bridging to Rivet's
 * onPartialOutputs pattern.
 */
export async function streamChatV2(
  options: RivetAiSdkOptions,
  onPartialOutput: (partial: Partial<RivetStreamResult>) => void,
): Promise<RivetStreamResult> {
  const result = streamText({
    model: options.model,
    messages: options.messages,
    system: options.system,
    tools: options.tools,
    maxTokens: options.maxTokens,
    temperature: options.temperature,
    topP: options.topP,
    topK: options.topK,
    stopSequences: options.stopSequences,
    providerOptions: options.providerOptions,
    abortSignal: options.signal,
  });

  const textParts: string[] = [];
  const toolCalls: RivetStreamResult['toolCalls'] = [];

  for await (const part of result.fullStream) {
    switch (part.type) {
      case 'text-delta':
        textParts.push(part.textDelta);
        onPartialOutput({ text: textParts.join('') });
        break;
      case 'tool-call':
        toolCalls.push({
          id: part.toolCallId,
          name: part.toolName,
          arguments: JSON.stringify(part.args),
        });
        onPartialOutput({ toolCalls: [...toolCalls] });
        break;
    }
  }

  const finalResult = await result;
  return {
    text: finalResult.text,
    toolCalls,
    usage: finalResult.usage,
    providerMetadata: finalResult.providerMetadata ?? {},
    finishReason: finalResult.finishReason,
  };
}
```

### What a v2 Provider Node Looks Like

Each v2 node is thin — provider-specific config + delegation to shared pipeline:

```typescript
// Example: ChatAnthropicV2Node.ts (conceptual, ~150 lines)

import { anthropic } from '@ai-sdk/anthropic';
import { streamChatV2 } from '../../model/chat-v2/aiSdkBridge.js';
import { getCommonChatV2Inputs, getCommonChatV2Outputs, ... } from '../../model/chat-v2/chatV2Shared.js';

const ChatAnthropicV2Impl: PluginNodeImpl<ChatAnthropicV2Node> = {
  getInputDefinitions(data) {
    return [
      ...getCommonChatV2Inputs(data),
      // Anthropic-specific:
      { id: 'thinkingBudget', title: 'Thinking Budget', dataType: 'number', ... },
    ];
  },

  getOutputDefinitions(data) {
    return [
      ...getCommonChatV2Outputs(data),
      // Anthropic-specific:
      { id: 'thinking', title: 'Thinking', dataType: 'string' },
      { id: 'citations', title: 'Citations', dataType: 'object[]' },
    ];
  },

  async process(data, inputs, context) {
    const resolved = resolveCommonParams(data, inputs);
    const model = anthropic(resolved.model);

    const result = await runChatV2Pipeline(data, inputs, context, {
      model,
      providerOptions: {
        anthropic: {
          thinking: data.enableThinking
            ? { type: 'enabled', budgetTokens: resolved.thinkingBudget }
            : undefined,
        },
      },
      // Anthropic-specific: map cache breakpoints from ChatMessage.isCacheBreakpoint
      messageTransform: (msgs) => applyCacheBreakpoints(msgs),
    });

    return {
      ...result.commonOutputs,
      ['thinking' as PortId]: { type: 'string', value: result.providerMetadata?.anthropic?.thinking ?? '' },
      ['citations' as PortId]: { type: 'object[]', value: result.providerMetadata?.anthropic?.citations ?? [] },
    };
  },
};
```

### Rivet ChatMessage ↔ AI SDK Message Conversion

A key piece: converting Rivet's `ChatMessage` type to the AI SDK's `CoreMessage` format:

```typescript
// model/chat-v2/messageConverter.ts

import type { CoreMessage, CoreUserMessage, ImagePart, FilePart } from 'ai';
import type { ChatMessage } from '../DataValue.js';

export function chatMessagesToCoreMessages(messages: ChatMessage[]): CoreMessage[] {
  return messages.map(chatMessageToCoreMessage);
}

function chatMessageToCoreMessage(msg: ChatMessage): CoreMessage {
  switch (msg.type) {
    case 'system':
      // AI SDK handles system via top-level `system` param, not in messages.
      // But it also supports { role: 'system' } in messages array.
      return { role: 'system', content: getTextContent(msg) };

    case 'user':
      return {
        role: 'user',
        content: convertUserParts(msg.message),
      };

    case 'assistant':
      return {
        role: 'assistant',
        content: getTextContent(msg),
        // Tool calls mapped from Rivet's function_calls
        ...(msg.function_calls ? {
          toolCalls: msg.function_calls.map(fc => ({
            toolCallId: fc.id ?? 'unknown',
            toolName: fc.name,
            args: JSON.parse(fc.arguments),
          })),
        } : {}),
      };

    case 'function':
      return {
        role: 'tool',
        content: [{ type: 'tool-result', toolCallId: msg.name, result: getTextContent(msg) }],
      };
  }
}

function convertUserParts(parts: ChatMessageMessagePart | ChatMessageMessagePart[]) {
  const partArray = Array.isArray(parts) ? parts : [parts];
  return partArray.map(part => {
    if (typeof part === 'string') return { type: 'text' as const, text: part };
    if (part.type === 'image') return { type: 'image' as const, image: part.data, mimeType: part.mediaType };
    if (part.type === 'url') return { type: 'image' as const, image: new URL(part.url) };
    if (part.type === 'document') return { type: 'file' as const, data: part.data, mimeType: part.mediaType };
  });
}
```

---

## What About Token Caching?

Token caching is provider-specific and cannot be fully abstracted:

### OpenAI (Responses API)
- **Automatic.** No configuration needed. Using `previous_response_id` maximizes cache hits.
- The AI SDK doesn't expose `previous_response_id` directly (it's an OpenAI-specific stateful feature).
- **Rivet approach**: For v2, expose an optional "Previous Response ID" input that passes through to the provider. Users can wire it from a previous Chat node's output.

### Anthropic
- **Explicit breakpoints.** `cache_control: { type: "ephemeral" }` on specific content blocks.
- Rivet already supports this via `ChatMessage.isCacheBreakpoint`.
- **Rivet approach**: The v2 node's message converter maps `isCacheBreakpoint` to `cache_control` via `providerOptions` or message annotations in the AI SDK.

### Google
- **Explicit cache creation.** You create a cache resource, then reference it in requests.
- This is a separate API call, not inline with the chat request.
- **Rivet approach**: A separate "Create Context Cache" node for Google, whose output connects to the Chat Google v2 node as a `cachedContent` input.

### Cost Impact Tracking
All providers report cached vs non-cached tokens in their usage:
- OpenAI: `usage.input_tokens_details.cached_tokens`
- Anthropic: `usage.cache_creation_input_tokens` + `usage.cache_read_input_tokens`
- Google: `usageMetadata.cachedContentTokenCount`

The v2 pipeline will extract these into a standardized output:
```typescript
{
  'usage' as PortId: {
    type: 'object',
    value: {
      promptTokens: number,
      completionTokens: number,
      cachedTokens: number,          // Normalized across providers
      thinkingTokens: number,        // Normalized across providers
      totalCost: number,             // Calculated from model registry
    }
  }
}
```

---

## What About Thinking/Reasoning?

### Unified Thinking Interface

All three major providers now support thinking. The v2 shared infrastructure provides:

**Common inputs:**
- `enableThinking` (boolean toggle)
- `thinkingBudget` (number — tokens for Anthropic/Google, maps to effort level for OpenAI)

**Common outputs:**
- `thinking` (string — the reasoning content, if available)
- `thinkingTokens` (number — tokens spent on reasoning)

**Provider mapping:**

| Rivet Setting | OpenAI | Anthropic | Google |
|---------------|--------|-----------|--------|
| `enableThinking: true` | `reasoning: { effort: "medium" }` | `thinking: { type: "enabled", budget_tokens: N }` | `thinkingConfig: { thinkingBudget: N }` |
| `thinkingBudget: 1000` | Maps to effort: low=1K, medium=10K, high=max | `budget_tokens: 1000` | `thinkingBudget: 1000` |
| `thinkingBudget: 10000` | `effort: "medium"` | `budget_tokens: 10000` | `thinkingBudget: 10000` |
| `thinkingBudget: 50000` | `effort: "high"` | `budget_tokens: 50000` | `thinkingBudget: 50000` |

For OpenAI, there's also `reasoning.summary` which is unique. The v2 OpenAI node exposes this as an additional "Reasoning Summary" dropdown (auto/concise/detailed).

---

## What About Tool Calling?

### Current Rivet Pattern
1. User creates `Tool` nodes that output `gpt-function` typed values
2. These connect to the Chat node's `functions` input
3. Chat node returns `function-calls` output (array of `{ name, arguments, id }`)
4. `DelegateFunctionCall` node routes calls to subgraphs
5. Results come back as `function` type ChatMessages in the conversation

### v2 Tool Calling Design

The v2 nodes keep the same graph-level pattern (it works well for visual programming), but internally use the AI SDK's normalized tool format:

```typescript
// In the v2 pipeline:
function convertRivetToolsToAiSdkTools(
  gptFunctions: GptFunction[]
): Record<string, CoreTool> {
  const tools: Record<string, CoreTool> = {};
  for (const fn of gptFunctions) {
    tools[fn.name] = {
      description: fn.description,
      parameters: jsonSchemaToZod(fn.parameters),  // or pass raw JSON schema
      // No execute callback — Rivet handles execution via graph connections
    };
  }
  return tools;
}
```

**What v2 adds:**
- **Structured output via tools**: The AI SDK's `generateObject` can use tool-based structured output automatically
- **Parallel tool calls**: All providers support multiple tool calls per response; the v2 output format handles arrays naturally
- **Tool choice normalization**: `auto`/`required`/`none`/specific tool — same input across providers

**OpenAI built-in tools (Responses API only):**
The v2 OpenAI node adds optional inputs for:
- `enableWebSearch` (boolean) → adds `web_search_preview` tool
- `enableCodeInterpreter` (boolean) → adds `code_interpreter` tool
- `fileSearchVectorStoreIds` (string[]) → adds `file_search` tool

These are OpenAI-specific and don't apply to other providers.

---

## Migration Plan

### Phase 0: Spike & Validation (1-2 days)

Before committing to the AI SDK approach, validate:

1. **Install `ai`, `@ai-sdk/openai`, `@ai-sdk/anthropic`, `@ai-sdk/google`** in `packages/core`
2. **Test in Tauri's webview environment**: Does `fetch` from provider packages work? Any Node.js-only dependencies?
3. **Test streaming**: Does `streamText` → async iteration → `onPartialOutputs` bridge work correctly?
4. **Test tool calling**: Does the SDK handle tool calls without `execute` callbacks correctly?
5. **Check OpenAI Responses API support**: Does `@ai-sdk/openai` support the Responses API yet? If not, can we use the Chat Completions API through the SDK (still an improvement) and add Responses API later?
6. **Bundle size impact**: What does adding these packages do to Tauri's webview bundle?

**If the spike fails** (e.g., browser compatibility issues), fall back to Strategy B (custom abstraction, see appendix).

### Phase 1: Shared v2 Infrastructure (additive only)

**Create the shared infrastructure. No existing code changes.**

Files created:
- `model/chat-v2/aiSdkBridge.ts` — Stream/generate bridge to Rivet's execution model
- `model/chat-v2/messageConverter.ts` — ChatMessage ↔ CoreMessage conversion
- `model/chat-v2/chatV2Types.ts` — Shared types (v2 config, v2 result, usage)
- `model/chat-v2/chatV2Shared.ts` — Shared input/output/editor builders
- `model/chat-v2/chatV2Pipeline.ts` — Shared process() orchestration (cache, retry, timing, outputs)
- `model/chat-v2/modelRegistry.ts` — Unified model registry with costs for all providers

Tests:
- Unit test message converter with all ChatMessage variants
- Unit test tool conversion (GptFunction → AI SDK tool)
- Integration test: streamChatV2 with a mock model

### Phase 2: Google v2 Node

**First provider migration. Google is simplest.**

- Create `plugins/google/nodes/ChatGoogleV2Node.ts`
- Register as type `chatGoogleV2` (distinct from `chatGoogle`)
- Provider-specific: `thinkingBudget`, `enableToolCalling`, `enableGrounding`, `responseMimeType`
- Test with Gemini 2.5 Pro/Flash: thinking, tool calling, structured output, streaming

### Phase 3: Anthropic v2 Node

- Create `plugins/anthropic/nodes/ChatAnthropicV2Node.ts`
- Register as type `chatAnthropicV2`
- Provider-specific: `thinkingBudget`, `enableCitations`, `cacheBreakpoints`
- Test with Claude Sonnet 4 / Opus 4: thinking, tool calling, citations, caching, PDF input

### Phase 4: OpenAI v2 Node

**Most complex due to Responses API features.**

- Create `model/nodes/ChatOpenAIV2Node.ts`
- Register as type `chatOpenAIV2` (or `chatV2` to claim the "default" name)
- Provider-specific: `reasoningEffort`, `reasoningSummary`, `enableWebSearch`, `enableCodeInterpreter`, `structuredOutput`, `previousResponseId`
- Test with GPT-4o, o3, o4-mini: reasoning, tool calling, web search, structured output, streaming

### Phase 5: App Integration

- Add v2 nodes to the node sidebar in the app
- Group under "Chat v2" or "AI Chat" category
- Add migration guide in the UI (tooltip/notice on legacy nodes: "A newer version is available")
- Update any templates that use chat nodes

### Phase 6: Polish & Optional Features

- **Unified "Chat" node** (optional): A single node with a provider dropdown, for users who want simplicity. This would be in addition to per-provider nodes, not replacing them.
- **Context Cache node** for Google (separate node for creating caches)
- **Response ID chaining** for OpenAI (output `responseId`, input `previousResponseId`)
- **Batch execution** node for Anthropic (long-running batch requests at 50% cost)

---

## Expected Outcomes

### Code Size

| Component | Lines |
|-----------|-------|
| Shared v2 infrastructure | ~400-500 |
| ChatGoogleV2Node | ~150-200 |
| ChatAnthropicV2Node | ~150-200 |
| ChatOpenAIV2Node | ~200-300 |
| **Total new code** | **~900-1,200** |

Compare to the current system: **5,100+ lines** for 4 providers.
The v2 system covers 3 providers in ~1,100 lines with **more features**.

### Adding a New Provider

**Before (current system):** ~1,500 lines, multi-day effort
**After (v2 system):** ~100-150 lines + `npm install @ai-sdk/newprovider`, couple hours

```typescript
// Entire new provider node:
import { newProvider } from '@ai-sdk/newprovider';
import { chatV2Pipeline } from '../../model/chat-v2/chatV2Pipeline.js';

const ChatNewProviderV2Impl = {
  getInputDefinitions: (data) => [...getCommonInputs(data)],
  getOutputDefinitions: (data) => [...getCommonOutputs(data)],
  getEditors: (data) => [...getCommonEditors(newProviderModels)],
  getBody: (data) => getCommonBody(data),
  process: (data, inputs, context) =>
    chatV2Pipeline(data, inputs, context, {
      createModel: (modelId) => newProvider(modelId),
    }),
};
```

### Feature Comparison

| Feature | Legacy Nodes | v2 Nodes |
|---------|-------------|----------|
| Basic chat | ✅ | ✅ |
| Streaming | ✅ | ✅ |
| Tool calling | ✅ (manual per-provider) | ✅ (normalized) |
| Thinking/reasoning | Partial (Google only) | ✅ (all providers) |
| Token caching | Partial (Anthropic only) | ✅ (all providers) |
| Structured output | ❌ | ✅ (all providers) |
| Citations | Partial (Anthropic only) | ✅ (Anthropic + Google grounding) |
| Audio I/O | Partial (OpenAI only) | ✅ (OpenAI + Google) |
| Document/PDF input | Partial (Anthropic only) | ✅ (all providers) |
| Web search | ❌ | ✅ (OpenAI built-in) |
| Code interpreter | ❌ | ✅ (OpenAI built-in) |
| Normalized usage/cost | ❌ (per-provider) | ✅ (unified output) |
| New provider effort | ~1,500 lines | ~100-150 lines |

---

## Risk Analysis

### Low Risk
- Phases 1-4 are purely additive (no existing code changes)
- Legacy nodes continue to work indefinitely
- Each phase is independently shippable

### Medium Risk
- **AI SDK browser compatibility**: Needs spike validation (Phase 0)
- **AI SDK version churn**: Vercel iterates fast. Pin versions, test before upgrading.
- **OpenAI Responses API support in AI SDK**: May not be available yet. Fallback: use Chat Completions through the SDK (still normalizes everything else).

### High Risk (Mitigated)
- **User confusion**: Two sets of chat nodes. **Mitigation**: Clear naming ("Chat v2 (Anthropic)"), deprecation notices on legacy nodes, migration guide.
- **External dependency**: Tying core functionality to Vercel's SDK. **Mitigation**: The bridge layer (`aiSdkBridge.ts`) is our abstraction point. If we ever need to drop the SDK, we replace the bridge, not all the nodes.

---

## Appendix: Strategy B — Custom Abstraction (Fallback)

If the AI SDK spike (Phase 0) fails — e.g., browser incompatibility, missing critical features, or unacceptable bundle size — fall back to building a custom provider abstraction:

1. **Keep the original refactor plan's shared infrastructure** (chatNodeShared.ts, chatRetry.ts, chatCache.ts)
2. **Create a `ChatProviderV2` interface** similar to the AI SDK's `LanguageModelV1` but Rivet-specific
3. **Implement per-provider adapters** that use the raw APIs directly (fetch + SSE parsing)
4. **Create v2 nodes** that use this custom abstraction

This is more work (~2x the code of the AI SDK approach) but has zero external dependencies.

---

## Appendix: Node Type Naming

Rivet's node registry requires unique type strings. Proposed:

| Provider | Legacy Type | v2 Type | Display Name |
|----------|-----------|---------|--------------|
| OpenAI | `chat` | `chatOpenAIV2` | Chat v2 (OpenAI) |
| Anthropic | `chatAnthropic` | `chatAnthropicV2` | Chat v2 (Anthropic) |
| Google | `chatGoogle` | `chatGoogleV2` | Chat v2 (Google) |
| HuggingFace | `chatHuggingFace` | (none — covered by OpenAI-compatible) | — |

Legacy nodes get a `(Legacy)` suffix added to their display names in the sidebar.

---

## Appendix: Rivet's ChatMessage Type Extensions

The current `ChatMessage` type may need extensions for v2 features:

```typescript
// Potential additions to ChatMessageMessagePart union:
| { type: 'audio'; mediaType: 'audio/wav' | 'audio/mp3'; data: Uint8Array }
| { type: 'video'; mediaType: string; data: Uint8Array }

// Potential additions to AssistantChatMessage:
thinking?: string;           // Reasoning/thinking content
thinkingTokens?: number;     // Tokens used for thinking

// Potential additions to all ChatMessage types:
metadata?: Record<string, unknown>;  // Provider-specific metadata passthrough
```

These extensions are backward-compatible (optional fields) and don't break existing `.rivet-project` files.

---

## Decision Log

| Decision | Chosen | Alternatives Considered | Why |
|----------|--------|------------------------|-----|
| New v2 nodes vs refactoring existing | New v2 nodes | Refactor in place | No node versioning; API paradigm shift (Responses API) |
| Vercel AI SDK vs custom | AI SDK (with spike) | Custom abstraction | 80% less transport code; 15+ providers; active maintenance |
| Per-provider v2 nodes vs unified | Per-provider | Single unified node | Provider-specific UIs too different; matches existing UX pattern |
| OpenAI API | Responses API | Chat Completions | Responses is the future; built-in tools; server-side state |
| Legacy node fate | Keep, deprecate | Remove | Backward compatibility for existing workflows |
