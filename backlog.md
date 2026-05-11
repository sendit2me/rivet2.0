

- Wrap lines in the full outptu wraps by letter instead of by word (at least in the Object node)

- Node description is rendered in bold. Don't

- Prompt node: add words and character counter just like in text node

- Prompt node: When an extrapolated variab;e gets "null", the prompt node goes "Error: Expected value of type string but got undefined". It should just get an empty string


- Remove "Run" items form the comment node's context menu






- Add "Freeze node" functionality? Kust like in That Databricks tool. Maybe it can replace the current LLM chat node's "cache" functionality

- Need to show the curent graph name somewhere. When there's many and they are in the folders and you click through subgraphs, the user gets lost

- In nodes that have variadic inputs, when an input in the middle is removed, the remaining inputs look weird. Do we need to automatically remove them? It should we allow the user to remove them if needed?


- There's 2 similar mono width fonts (node body + node output view). Or maybe they are the same fornt but different sizes. Also the one in the code editor is different. Let's only keep one

- Make node terminals not round, but half squircles on the inside part of the node



- Get back to MCP and see if it works and how it works. I don't see an MCP node. I think we need it
- Reassess all the "Generate using AI" in different nodes. The model picker is clipped by the section border





- Reassess Loop until node. Definitely can make the end conditions better


- Reassess Ctrl+N window


- Human readable Loop node



- In the node output when there's yellow headers, without hover the headers are not visible. I want them to be visible

- New artboard background image. I want diagonal strokes like in the logo



- Remove the colored triangle in the node's output



- A setting for LLM chat node to race several LLM calls and return the fastest. Need to think through how it works along with retries


- Reassess rivet example project
rivet2.0/packages/app/src/assets/tutorials
/documentation-tutorial.rivet-project

- Add mid points to connections so I can do neat wiring
- Code node (and Expression node) should have a "Catch failures" switcher so I can safely fallback with coalesce

- Support Python in all nodes that support javascript
- Light color theme

- Check the AI workflow generation feature

- Convenient node type browser, just like in n8n
- Show run time in each node
- I want to be able to adjust the node height when it's not hovered so I can see this much of the content in the output section


