---
title: 'Executing Workflows'
sidebar_label: 'Executing Workflows'
---

## Data Flow

In general, data flows from **left to right** in a graph.

Graph execution will start from every node that does not have any inputs. You can refer to these nodes as **root nodes**.

When a node is executed, it will send its output to all of its connected nodes.

A node must wait for all of its inputs to be received before it can execute.

The following graph will _roughly_ execute in the order of these numbers. Every node with the same number will run in parallel. The arrows show the rough "flow" of the data.

![Data Flow](assets/data-flow.png)

## Chaining LLM Responses

A common flow for chaining model responses will be something like:

- Initialize a system prompt with a [Text Node](../node-reference/text), and connect it to the **System Prompt** port of an [LLM Chat Node](../node-reference/llm-chat).
- Construct your main prompt by using a [Text Node](../node-reference/text) or a [Prompt Node](../node-reference/prompt), and connect it to the **Prompt** port of an [LLM Chat Node](../node-reference/llm-chat). You may also use an [Assemble Prompt Node](../node-reference/assemble-prompt) to construct a series of messages. The Prompt input accepts a string, string array, chat message, or chat-message array.
- Commonly you will want to parse the LLM Chat **Response** output. This can be accomplished using the [Extract with Regex Node](../node-reference/extract-with-regex), the [Extract JSON Node](../node-reference/extract-json), or the [Extract YAML](../node-reference/extract-yaml) node. You can also use the Extract with Regex node to extract multiple values from plain text.
- Next, it is common to use an [Extract Object Path](../node-reference/extract-object-path) node to extract a specific value from the structured data using jsonpath. This is useful if you are using the [Extract JSON Node](../node-reference/extract-json) or the [Extract YAML](../node-reference/extract-yaml) node.
- You may want to take different actions depending on what your extracted value is. For this, you can use the [Match Node](../node-reference/match) to match the extracted value against a series of patterns. Or, you can use an [If/Else Node](../node-reference/if-else) to get fallback values.
- Next, you will often use more [Text Nodes](../node-reference/text), [Prompt Nodes](../node-reference/prompt), or Code nodes while interpolating extracted values, then send the result to another LLM Chat node.
- The workflow can continue indefinitely, with the response of one LLM Chat node becoming part of the prompt for another LLM Chat node. Or, you can use a [Loop Controller Node](../node-reference/loop-controller) to pipe the results of this workflow back into itself.

The legacy [Chat Node](../node-reference/chat) is still available for existing projects, but new Rivet 2 workflows should usually start with LLM Chat because it supports OpenAI, Anthropic, Google, custom OpenAI-compatible providers, input-port API keys, reasoning settings, tool use, and response status/error diagnostics from one node.
