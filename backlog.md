

- In the comment node, the node header is much more minimalistic than in usual nodes and as a result the gear icon is too pressed into the header corner. Fix it


- Need to show the curent graph name somewhere. When there's many and they are in the folders and you click through subgraphs, the user gets lost. It's already shown in the run button. maybe make it more noticeable?



- In the node inputs list, allow changing their order manually. But when the amount of the inputs changes, the order can reset




- New Code node that uses interpolated input variables. But it's not clear how to define output variables and their types


- Remote debugger gets disconnected after some time

- With time, the turned on remore debugger turns off

- When the graph is open but it is in the folder that is closed in the sidebar, highlight the folder where the graph is so it's easier to find it

- Need a "Not" node?

- When duplicating the node, create a copy right below the original node, not just a little bit lower



- Add "Freeze node" functionality? Kust like in That Databricks tool. Maybe it can replace the current LLM chat node's "cache" functionality


- In nodes that have variadic inputs, when an input in the middle is removed, the remaining inputs look weird. Do we need to automatically remove them? It should we allow the user to remove them if needed?


- There's 2 similar mono width fonts (node body + node output view). Or maybe they are the same fornt but different sizes. Also the one in the code editor is different. Let's only keep one

- Make node terminals not round, but half squircles on the inside part of the node



- Get back to MCP and see if it works and how it works. I don't see an MCP node. I think we need it
- Reassess all the "Generate using AI" in different nodes. The model picker is clipped by the section border


- In both Text node and Prompt node, in the statistics, output the amount of tokens (average for english language)



- Reassess Loop until node. Definitely can make the end conditions better


- Reassess Ctrl+N window


- Human readable Loop node



- In the node output when there's yellow headers, without hover the headers are not visible. I want them to be visible

- New artboard background image. I want diagonal strokes like in the logo. Also maybe more sparse crosses in rectangular manner



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

