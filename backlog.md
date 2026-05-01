- Human readable Loop node

- Unreachable and referenced features - allow disabling them in the UI settings

- Retry behevior for the LLM chat node

- Provider Advanced - Base URL - should be a separate edit from the "Provider base URL" that we see in the "Model" section when we choose "Custom provider". Now, when I choose "Custom provider", and set "Provider base URL" and then change the model to OpenAI for instance, the "Base URL" in the "Provider Advanced" section changes to what I entered for the custom provider. That's bad UX.

- Reassess Ctrl+N window

- Check if refetch model list works with the input port key

- Make the workspace navigation less annoying

- Make default base font size 15px instead of 14px. I mean when someone starts Rivet for the first time. If the user has already chosen some size, don't change it.

- Compare the current Rivet 2.0 to the rivet in Rivet Server and make sure the new rivet will work there

- Check how "Check for updates" button works

- Check the links that lead to the documentation

- Get back to MCP and see if it works and how it works. I don't see an MCP node. I think we need it
- Check the AI workflow generation feature
- Reassess all the "Generate using AI" in different nodes.



- Make it easier and faster to create input and output nodes for the graph
- Add mid points to connections so I can do neat wiring
- Reassess the Rivet settings. probbaly something needs reworking
- Code node (and Expression node) should have a "Catch failures" switcher so I can safely fallback with coalesce
- Update the rivet version (at least in the Settings popup)
- In remote debugging, come up with some ID that can be passed when running so that I can "catch" only the target runs of the workflow


- Support Python in all nodes that support javascript
- Light color theme


- Convenient node type browser, just like in n8n
- Show run time in each node
- I want to be able to adjust the node height when it's not hovered so I can see this much of the content in the output section


