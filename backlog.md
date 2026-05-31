


- In the full output modal show word and character counters


- Need to show the curent graph name somewhere. When there's many and they are in the folders and you click through subgraphs, the user gets lost. It's already shown in the run button. maybe make it more noticeable?



- Code editor: show a hint that Ctrl++ and Ctrl+- are working here. Also add Ctrl/Cmd+scroll to scale the font size

- When I need to gather a lot of inputs into one node, it looks messy and it's easy to look over some connections. like in the "setGlobals" graph. We need to do something about this UX. maybe introduce a "Group" node that will contain many same type nodes and combine their outputs into one so I can later pipe it into just one node and be sur ethat all the nodes are connected?





- Reassess templates for the Ctrl+N window






- Now, the executor mode is global for all open projects (remote debugger, browser, node). Make it per tab





- Get back to MCP and see if it works and how it works. I don't see an MCP node. I think we need it
- Reassess all the "Generate using AI" in different nodes. The model picker is clipped by the section border


- In nodes that have variadic inputs, when an input in the middle is removed, the remaining inputs look weird. Do we need to automatically remove them? It should we allow the user to remove them if needed?

- In both Text node and Prompt node, in the statistics, output the amount of tokens (average for english language)

- Reassess Loop until node. Definitely can make the end conditions better

- Human readable Loop node

- In the node output when there's yellow headers, without hover the headers are not visible. I want them to be visible

- Make node terminals not round, but half squircles on the inside part of the node

- A setting for LLM chat node to race several LLM calls and return the fastest. Need to think through how it works along with retries

- Reassess rivet example project
  rivet2.0/packages/app/src/assets/tutorials
  /documentation-tutorial.rivet-project

- Add mid points to connections so I can do neat wiring
- Code node (and Expression node) should have a "Catch failures" switcher so I can safely fallback with coalesce

- Light color theme

- Check the AI workflow generation feature

- Convenient node type browser, just like in n8n
- Show run time in each node
- I want to be able to adjust the node height when it's not hovered so I can see this much of the content in the output section

- Support Python in all nodes that support javascript
