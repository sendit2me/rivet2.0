# Refactor: LLM Chat v2 Plan

## Summary

Rivet will add a new unified `LLM Chat v2` node backed by the Vercel AI SDK.

We are not refactoring the existing provider-specific chat nodes in place. They remain as legacy nodes for backward compatibility.

The v2 direction is:

- one primary `LLM Chat v2` node
- one shared AI SDK-based execution layer
- provider selection inside the node
- provider-specific advanced settings shown conditionally
- separate companion nodes only for workflows that are genuinely not "chat with extra settings"

## What We Decided

### Core Product Decision

The new chat experience will be a single vendor-agnostic node, not separate OpenAI, Anthropic, and Google v2 nodes.

Why:

- the AI SDK gives us a shared transport, message, tool, and streaming abstraction
- users should be able to switch providers without rewiring the graph
- legacy provider-specific nodes already preserve the old UX
- provider-specific settings can live behind conditional advanced sections

### Backward Compatibility

We will keep these existing nodes unchanged except for normal maintenance:

- `chat`
- `chatAnthropic`
- `chatGoogle`
- `chatHuggingFace`

They should be treated as legacy nodes once `LLM Chat v2` is available.

### Where Provider Differences Still Live

Provider differences still matter, but they should not force separate primary chat nodes.

They belong in one of two places:

- conditional advanced settings inside `LLM Chat v2`
- companion nodes for provider-specific workflows

Examples:

- OpenAI-only: web search, code interpreter, `previousResponseId`
- Anthropic-only: citations, cache breakpoint behavior
- Google-only: context cache creation/reference

## Spike Outcome

The spike is complete and the AI SDK approach is validated enough to proceed.

Confirmed findings:

- AI SDK v6 uses `ModelMessage` and `Tool`
- `ImagePart.image` and `FilePart.data` accept `Uint8Array` directly
- `zod@4.3.6` worked fine
- AI SDK packages ship dual ESM+CJS bundles
- the streaming bridge maps cleanly to Rivet's `StreamedFunctionCall`

Conclusion:

- continue with the AI SDK approach
- do not spend more time re-evaluating custom abstraction unless implementation uncovers a real blocker

## Current Status

### Phase 0

Done.

### Phase 1

Done as foundation work.

Shared v2 infrastructure now exists under `packages/core/src/model/chat-v2/`.

Implemented pieces:

- `aiSdkBridge.ts`
- `messageConverter.ts`
- `toolConverter.ts`
- `chatV2Types.ts`
- `chatV2Shared.ts`
- `chatV2Pipeline.ts`
- `modelRegistry.ts`

Tests were added for the shared layer, but full validation still depends on running the normal core test/build commands in an environment where Node tooling is available.

### Phase 2

Done.

`LLM Chat v2` now exists as `packages/core/src/model/nodes/LLMChatV2Node.ts`.

Implemented:

- unified `llmChatV2` node type
- provider dropdown
- provider-scoped model dropdown
- shared inputs/outputs/editors
- shared execution through `chatV2Pipeline`
- built-in registration in the node registry

### Phase 3

Done.

Provider-specific advanced sections now exist inside `LLM Chat v2`.

Implemented:

- OpenAI: reasoning effort, reasoning summary, `previousResponseId`, web search, code interpreter
- Anthropic: thinking mode, thinking budget, cache breakpoint TTL, bridge support for cache breakpoint metadata and citation-enabled documents
- Google: thinking budget, structured outputs, Google Search grounding, URL context

### Phase 4

Done.

No companion nodes were added. The current decision remains to defer them until a concrete workflow requires them.

### Phase 5

Done for the node surface.

Implemented:

- `LLM Chat v2` is registered in the node picker
- legacy chat nodes are labeled clearly as legacy in the UI
- migration guidance is present in the node info text

Existing shipped graph/template assets were intentionally left unchanged for backward compatibility.

### Phase 6

Done for the initial release.

The current polish pass made `LLM Chat v2` the recommended chat node by:

- giving it the primary non-legacy chat position in built-in nodes
- keeping the default experience focused on shared settings
- moving provider-specific behavior into conditional advanced groups

## Target Architecture

```text
packages/core/src/
  model/chat-v2/
    aiSdkBridge.ts
    messageConverter.ts
    toolConverter.ts
    chatV2Types.ts
    chatV2Shared.ts
    chatV2Pipeline.ts
    modelRegistry.ts
    providerOptions.ts

  model/nodes/
    ChatNodeBase.ts        # legacy
    LLMChatV2Node.ts       # new unified node
```

`LLMChatV2Node` should:

- let the user choose provider and model
- use the shared pipeline for execution
- expose normalized outputs for response, messages, usage, and tool calls
- expose provider-specific advanced settings only when relevant

## Scope of `LLM Chat v2`

### Required Shared Behavior

The first shippable version of `LLM Chat v2` should support:

- provider dropdown
- model selection
- system prompt
- prompt/messages input
- streaming text output
- tool calling
- normalized usage output
- appended `all-messages` output

### Provider-Specific Advanced Behavior

After the common path is stable, add conditional advanced settings for:

- Google: thinking budget, grounding-related settings, structured-output controls
- Anthropic: citations, cache breakpoint support, thinking budget
- OpenAI: reasoning effort, reasoning summary, built-in tools, `previousResponseId`

### Out of Scope for the Core Node

These should stay as separate companion workflows if we still need them:

- Google context cache creation/reference
- Anthropic batch execution
- optional OpenAI response chaining helper

## Implementation Plan

### Phase 2: DONE

Implemented in `packages/core/src/model/nodes/LLMChatV2Node.ts`.

Deliver:

- node type such as `llmChatV2`
- provider dropdown
- model dropdown scoped by provider
- common shared inputs/outputs/editors
- shared execution through `chatV2Pipeline`
- provider switching without changing graph structure

Acceptance criteria:

- one graph can run against OpenAI, Anthropic, or Google by changing node settings
- streaming works
- tool calls work
- normalized usage output works

### Phase 3: DONE

Implemented in `LLM Chat v2`.

Deliver:

- provider-aware editor groups
- provider option mapping into AI SDK `providerOptions`
- normalized outputs where useful

Acceptance criteria:

- advanced settings only appear when the selected provider supports them
- the default node experience stays simple
- provider-specific features do not change the shared output contract unless necessary

### Phase 4: DONE

No companion nodes were added because there is not yet a concrete workflow that requires them.

Candidate companion nodes:

- Google context cache node
- Anthropic batch node
- OpenAI response-chain helper

These remain optional unless a concrete use case requires them.

### Phase 5: DONE

Deliver:

- add `LLM Chat v2` to the node picker
- mark legacy nodes clearly
- add migration guidance in the UI

### Phase 6: DONE

Deliver:

- simplified vs advanced mode in the node UI if needed
- make `LLM Chat v2` the default recommended chat node
- fill any remaining provider gaps that are still worth exposing

## Risks

### Main Risk

The main product risk is not transport anymore. It is UI complexity.

If too many provider-specific settings are exposed directly, the unified node can become hard to use.

Mitigation:

- default to the common path
- hide advanced settings unless relevant
- move non-chat workflows into companion nodes

### Dependency Risk

We are depending on the Vercel AI SDK for the shared runtime layer.

Mitigation:

- pin versions
- keep the bridge layer as Rivet's abstraction boundary
- only revisit a custom abstraction if a real implementation blocker appears

## Naming

Proposed node types:

- `llmChatV2` for the unified node
- `googleContextCache` for a Google cache companion node if needed
- `anthropicBatch` for an Anthropic batch node if needed
- `openAIResponseChain` for an OpenAI helper node if needed

Legacy nodes should be labeled clearly as legacy in the UI.

## Decision Record

- Use Vercel AI SDK rather than a custom abstraction.
- Ship one unified `LLM Chat v2` node rather than separate provider-specific v2 chat nodes.
- Keep existing chat nodes for backward compatibility.
- Put provider-specific behavior into advanced sections or companion nodes, not separate primary chat nodes.
