---
title: 04 - YAML
---

# YAML

YAML is useful when you want an LLM, a Code node, or a human-editable text block to produce structured data without making the graph depend on brittle string parsing.

In this tutorial, you will turn text into an object with the [Extract YAML Node](../node-reference/extract-yaml.mdx), extract one field from that object, and then turn an object back into YAML with the [To YAML Node](../node-reference/to-yaml.mdx).

## Why YAML Helps

LLMs are often better at following a clear shape than at producing a one-line value. Instead of asking for "a title and three tasks" in plain text, ask for a YAML block:

```yaml
yamlDocument:
  title: Launch checklist
  tasks:
    - name: Write release notes
      owner: Docs
    - name: Build installer
      owner: Release
    - name: Smoke test app
      owner: QA
```

Rivet can parse that into an `object`, which makes later nodes easier to connect and reason about.

## Extract YAML

1. Add a [Text Node](../node-reference/text.mdx).
2. Paste the YAML example above into the Text node.
3. Add an [Extract YAML Node](../node-reference/extract-yaml.mdx).
4. Connect the Text node output to the Extract YAML node `Input`.
5. Run the graph.

The Extract YAML node looks for a root property name. By default that root is `yamlDocument`, so the example works without changing settings.

The `Output` port produces an object like:

```json
{
  "yamlDocument": {
    "title": "Launch checklist",
    "tasks": [
      { "name": "Write release notes", "owner": "Docs" },
      { "name": "Build installer", "owner": "Release" },
      { "name": "Smoke test app", "owner": "QA" }
    ]
  }
}
```

If the input text does not contain a matching YAML block, the `No Match` output runs instead.

## Extract One Value

The Extract YAML node can also extract one value from the parsed object.

1. Open the Extract YAML node settings.
2. Set `Object Path` to:

```text
$.yamlDocument.tasks[0].owner
```

3. Run the graph again.

The `Output` port now contains `Docs`.

Use JSONPath expressions in `Object Path`. A path that matches multiple values can also use the `Matches` output to return all matches.

## Convert an Object to YAML

Use the [To YAML Node](../node-reference/to-yaml.mdx) when you already have an object and want a readable YAML string.

1. Add an [Object Node](../node-reference/object.mdx).
2. Create an object with a few fields.
3. Add a To YAML node.
4. Connect the Object node output to the To YAML node `Object` input.
5. Run the graph.

The To YAML node outputs a `string`. This is handy for prompts, logs, text files, and APIs that expect YAML.

## Practical Pattern

A common low-code pattern is:

1. Ask an LLM Chat node to answer in YAML under `yamlDocument`.
2. Use Extract YAML to parse the answer.
3. Use Extract Object Path or Destructure to pull out the fields the rest of the graph needs.
4. Use To YAML only when you need to show or send the structured result as text again.

This keeps the graph structured internally even when the model response starts as text.
