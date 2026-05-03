---
title: Running Many Items
sidebar_label: Running Many Items
---

Rivet nodes can run once, or they can run many times over array inputs. The current UI calls this the node's run mode.

Open a node settings panel and use the run-mode segmented control near the top:

- **Run once**: the normal mode. The node runs one time after all required inputs are available.
- **Many parallel runs**: the node runs once per item and executes multiple items at the same time.
- **Many sequential runs**: the node runs once per item, but waits for one item to finish before starting the next.

## How Inputs Are Matched

When a node runs many items, Rivet treats array inputs as the per-item values for each run.

- If one input receives an array, the node runs once for each item in that array.
- If several inputs receive arrays, Rivet zips them together by index. The first run receives the first item from each array, the second run receives the second item from each array, and so on.
- If an input receives a single value while another input receives an array, Rivet reuses that single value for every item run.

Each output becomes an array containing one output value per item run.

## Limits And Concurrency

When you choose **Many parallel runs** or **Many sequential runs**, Rivet shows run-limit settings under the mode control.

- **Max runs** limits how many array items this node will process. This prevents accidental huge runs.
- **Max concurrent runs** is available for parallel mode and controls how many item runs may be active at the same time.

Sequential mode ignores max concurrency because it intentionally runs one item at a time.

## Example

One common pattern is processing a folder of files:

1. Use a [Read Directory Node](../node-reference/read-directory) to produce an array of file paths.
2. Connect that array to a [Read File Node](../node-reference/read-file).
3. Set the Read File node to **Many parallel runs**.
4. Connect the file contents to a [Text Node](../node-reference/text) or [LLM Chat Node](../node-reference/llm-chat), also set to run many items when you want one request per file.

The final LLM Chat response output will be an array with one response for each processed file.

## Joining Results

At some point you may want to turn many item outputs back into one value.

- Passing a string array into a [Text Node](../node-reference/text) or [Prompt Node](../node-reference/prompt) joins the strings with newlines.
- [Extract Object Path](../node-reference/extract-object-path) can select a specific item or property from an array.
- [Pop](../node-reference/pop) can take one value from an array.
- [Code](../node-reference/code) can perform custom joins, such as mapping, reducing, grouping, or formatting arrays.

## Nested Many-Item Runs

Nested arrays are not directly supported as a single node run mode. If you need nested item processing, put the inner flow in a subgraph and run a [Subgraph Node](../node-reference/subgraph) many times. The subgraph can contain its own nodes that also run many items.

Be careful with nested parallelism. It can create many provider requests or file operations very quickly, so use **Max runs** and **Max concurrent runs** deliberately.
