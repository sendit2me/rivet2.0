

- LLM chat node: make "response" a parsed object when the response format is set to structured

- New coalesce node without a duplicated conditional port (there's if port for that)

- Add for all nodes a special output that is true when the node is run. Or. The "if" input should accept anything as true if it was run


- Need to show the curent graph name somewhere. When there's many and they are in the folders and you click through subgraphs, the user gets lost



- There's 2 similar mono width fonts (node body + node output view). Or maybe they are the same fornt but different sizes. Also the one in the code editor is different. Let's only keep one

- Node terminals make not round, but half squircles on the inside part of the node



- Get back to MCP and see if it works and how it works. I don't see an MCP node. I think we need it
- Reassess all the "Generate using AI" in different nodes. The model picker is clipped by the section border


- In remote debugging, come up with some ID that can be passed when running so that I can "catch" only the target runs of the workflow


- A setting for LLM chat node to race several LLM calls and return the fastest. Need to think through how it works along with retries

- Reassess Loop until node. Definitely can make the end conditions better


- Reassess Ctrl+N window


- Human readable Loop node



- In the node output when there's yellow headers, without hover the headers are not visible. I want them to be visible

- New artboard background image. I want diagonal strokes like in the logo



- Remove the colored triangle in the node's output





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


