
- When I'm renaming the already connected graph's output, it is being renamed slowly letter by letter. Maybe because on each change in the name field there's a lot of actions happening? Maybe let's just debounce the rename action?


- Node settings panel with text/code editor sometimes is loading fro 5 seconds


- Change the IF port so it doesn't take up spane in the node's header and so it looks like a very special input port

- Code editor: show a hint that Ctrl++ and Ctrl+- are working here. Also add Ctrl/Cmd+scroll to scale the font size

- Words: 20 Characters: 111 - make the separator larger


- Reassess Ctrl+N window



- In the node inputs list, allow changing their order manually. But when the amount of the inputs changes, the order can reset



- Now, the executor mode is global for all open projects (remote debugger, browser, node). Make it per tab

- Need to show the curent graph name somewhere. When there's many and they are in the folders and you click through subgraphs, the user gets lost. It's already shown in the run button. maybe make it more noticeable?




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
