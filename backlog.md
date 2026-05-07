

- Human readable Loop node

- Reassess Loop until node. Definitely can make the end conditions better

- A setting for LLM chat node to race several LLM calls and return the fastest





- Remove the colored triangle in the node's output



- In the settings modal, make the left panel fixed. I mean I don't want it to scroll with the long content in the right column. But if the left panel is higher than the modal itself, then yes, let tje user scroll it

- Object node's content is clipped with "...". It should be overflow-hidden. Text nodes should wrap instead of clipping.

- LLM chat node: make response a parsed object when the output is structured?

- What will happen when rivet app finds updates?


- There's 2 similar mono width fonts (node body + node short output). lso the one in the code editor is different. Let's only keep one


- Need to show the curent graph name somewhere. When there's many and they are in the folders and you click through subgraphs, the user gets lost

- New coalesce node without a duplicated conditional port (there's if port for that)

- Reassess Ctrl+N window




- When I open the main run menu for the first time, it has a thick white border around it. It goes away when I click at least one item in the menu. Sounds like browser focis or something

- In the node output when there's yellow headers, without hover the headers are not visible. I want them to be visible

- New artboard background image. I want diagonal strokes like in the logo

- Node terminals make not round, but half squircles on the inside part of the node




- Add for all nodes a special output that is true when the node is run. Or. The "if" input should accept anything as true if it was run


- When in the node settings panel and I click elsewhere and hit the comments node, the panel doesn't close



- Reassess rivet example project
rivet2.0/packages/app/src/assets/tutorials
/documentation-tutorial.rivet-project



- Get back to MCP and see if it works and how it works. I don't see an MCP node. I think we need it
- Reassess all the "Generate using AI" in different nodes. The model picker is clipped by the section border



- Add mid points to connections so I can do neat wiring
- Code node (and Expression node) should have a "Catch failures" switcher so I can safely fallback with coalesce
- In remote debugging, come up with some ID that can be passed when running so that I can "catch" only the target runs of the workflow


- Support Python in all nodes that support javascript
- Light color theme

- Check the AI workflow generation feature



- Convenient node type browser, just like in n8n
- Show run time in each node
- I want to be able to adjust the node height when it's not hovered so I can see this much of the content in the output section


