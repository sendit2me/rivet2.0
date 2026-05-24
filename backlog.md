
- In both Expression and new Code nodes, when they return an object (as a literal or as a variable), this object is weird. When I retyrn it in the main workflow output that expects an object, my backend (that recieves it via HTTP) fails. But if after the expression/code node I add an "Object" node with thr content "{{input}}" that does nothing, just accepts an object and passes further, it all works. If I comvert the object to text and then parse it, it all works too. I tried to copy the object (from the expression/code node output) and look at it, but it's fine. I only get the probkem when I return such object right away from the main graph.

- Sometimes when I click the project tree with the right mouse button, the Rivet crashes

react-dom-BiLoywox.js:3093 RangeError: Maximum call stack size exceeded
    at editorBridgeFocus-PphY3KF8.js:446:67
    at editorBridgeFocus-PphY3KF8.js:448:38
    at Array.forEach (<anonymous>)
    at editorBridgeFocus-PphY3KF8.js:447:13
    at editorBridgeFocus-PphY3KF8.js:448:38
    at Array.forEach (<anonymous>)
    at editorBridgeFocus-PphY3KF8.js:447:13
    at editorBridgeFocus-PphY3KF8.js:448:38
    at Array.forEach (<anonymous>)
    at editorBridgeFocus-PphY3KF8.js:447:13
react-dom-BiLoywox.js:2206 Uncaught RangeError: Maximum call stack size exceeded
    at editorBridgeFocus-PphY3KF8.js:446:67
    at editorBridgeFocus-PphY3KF8.js:448:38
    at Array.forEach (<anonymous>)
    at editorBridgeFocus-PphY3KF8.js:447:13
    at editorBridgeFocus-PphY3KF8.js:448:38
    at Array.forEach (<anonymous>)
    at editorBridgeFocus-PphY3KF8.js:447:13
    at editorBridgeFocus-PphY3KF8.js:448:38
    at Array.forEach (<anonymous>)
    at editorBridgeFocus-PphY3KF8.js:447:13
HostedEditorApp-DOEPI7oD.js:114464 WebSocket connection to 'wss://storyteller-rivet.litnet.com/ws/executor/internal' failed: WebSocket is closed before the connection is established.





- Small and big letters in graph names affect the sorting in the panel. Don't


- Did run nod c remove the explanation form the node's body and put it into the settings panel

- For each node in the settings panel; add a link to the user documentation

- When a graph is picked in the left panel and the panel is open, make F2 force renaming


- Make get global and set global nodes different enough thtat it's easy to notice which is which. Like, icons maybe?

- Need keyboard shortcuts to run the project and the current graph

- When I decrease the left panel width too narrow, collapse it completely as if I clicked the collapse button


- Now, the executor mode is global for all open projects (remote debugger, browser, node). Make it per tab



- Need to show the curent graph name somewhere. When there's many and they are in the folders and you click through subgraphs, the user gets lost. It's already shown in the run button. maybe make it more noticeable?



- New artboard background image. I want diagonal strokes like in the logo. Also maybe more sparse crosses in rectangular manner


- Support Python in all nodes that support javascript


- In the node inputs list, allow changing their order manually. But when the amount of the inputs changes, the order can reset

- Reassess Ctrl+N window


- Get back to MCP and see if it works and how it works. I don't see an MCP node. I think we need it
- Reassess all the "Generate using AI" in different nodes. The model picker is clipped by the section border


- Add "Freeze node" functionality? Kust like in That Databricks tool. Maybe it can replace the current LLM chat node's "cache" functionality


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

