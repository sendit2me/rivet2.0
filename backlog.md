

- Human readable Loop node



- Make it work with OpenAPI compatible LLM providers like Cerebras and OpenRouter


- Prompt and Tool nodes: make the node body more neat with nice gaps and colors. Current italic is too poor and subtle.

- In the output (node or full view), when I hover the item in the list-output, let's make the vertical bar left to the item more bright.

- In the full output modal, make the control panel more neat and when the content scrolls, make it less iriitating



- In split node, parallel one, is there a limit on the max concurrent parallel runs? If not, it's bad

- How does "Strict" setting work in the Tool node

- Ctrl+X functionality for nodes

- Make it easier and faster to create input and output nodes for the graph

- Compare the current Rivet 2.0 to the rivet in Rivet Server and make sure the new rivet will work there

- Check the AI workflow generation feature


- Reassess the Rivet settings. probbaly something needs reworking

- Every node (Or Code + Expression + HTTP) should have a "Do not throw" switcher so I can safely fallback with coalesce

- Update the rivet version (at least in the Settings popup)

- Get back to MCP and see if it works and how it works. I don't see an MCP node. I think we need it

- In remote debugging, come up with some ID that can be passed when running so that I can "catch" only the target runs of the workflow




- Support Python in all nodes that support javascript

- Light color theme




- Convenient node type browser, just like in n8n


- For all three nodes, add the "Show 'Parsed expression' in non-error outputs" switcher in the node settings (after the code snippet). Make it that default to off.

- A way to throw the error into the workflow response whenever the workflow breaks and ends


- Show run time in each node




- Add mid points to connections so I can do neat wiring



- I want to be able to adjust the node height when it's not hovered so I can see this much of the content in the output section

- When editing the code node inputs and outputs, the return object should be rewritten accordingly??? At least when it's not altered yet???


- Новый ИИ нод долен принимать низкоуровневые параметры типа массива инпутов где я сам проставляю роли. Но ризонинг например доложен быть унифицирован чтобы стаивть минимальный или нулевойю Также должен быть стриминг, но непонятно зачем — куда его пробрасывать - может перпедавать во внешний вызов функции? Или прям устанавливать вебсокет соединение с чем-то? 


