- Observability on where a certain graph is used


- Support Python in all nodes that support javascript

- In all expression node, JS filter and JS map nodes - if no interpolation variables are used (effectively no imput terminal fro valiables created), do not show the "Parsed expression" section in the node's output view. Otherwise - show it. For JS filter and JS map nodes too.

- For all three nodes, add the "Show 'Parsed expression' in non-error outputs" switcher in the node settings (after the code snippet). Make it that default to off.

- All our latest changes with showing the parsed expressions and parsing for highlighting the error line in the oocde snippet - make sure these changes can't possibly break the workflow execution in production (when the workflow is run on the backend via the Rivet nodejs lib). Running workflows programmatically is a priority

- Node for accessing headers of the request

- Convenient node type browser, just like in n8n

- A way to throw the error into the workflow response whenever the workflow breaks and ends

- A faster way to open a subgraph than from a context menu

- In remote debugging, come up with some ID that can be passed when running so that I can "catch" only the target runs of the workflow

- Make sure a long running node is visible enough

- In the output full popup in the markdown mode some linebreaks disappear

- In the comment node the layout of text seems to be broken. The colors look stupid too. Also need to checl if the comment node resizes in all directions

- Get bacl the save and cancel buttons to the node title and description fields

- The popup full view of the output - I want to be able to resize it from left and right as much as I want

- Make sure text copies on Ctrl+C no problem from full view popup and output panel

- The remote debugger window pops up somewher eon the left. It has to appear next to the button that I clicked to open it

- Random number node

- When a subgraph node has an input connection and then this input port is removed, the phantom connection persists (it shouldn't)

- Nodes for working with lists: get element by index

- When the "comment" node is partially out of view, it disappears

- Show run time in eachnode

- Destructure node: when adding a new line, auto isert "$." into it

- Every node should have a "Do not throw" switcher so I can safely fallback with coalesce


- When the output is large and paged, the page size seems to be too small. I need to check. It affects the search

- Add mid points to connections so I can do neat wiring



- I want to be able to adjust the node height when it's not hovered so I can see this much of the content in the output section

- When editing the code node inputs and outputs, the return object should be rewritten accordingly??? At least when it's not altered yet???


- Новый ИИ нод долен принимать низкоуровневые параметры типа массива инпутов где я сам проставляю роли. Но ризонинг например доложен быть унифицирован чтобы стаивть минимальный или нулевойю Также должен быть стриминг, но непонятно зачем — куда его пробрасывать - может перпедавать во внешний вызов функции? Или прям устанавливать вебсокет соединение с чем-то? 

- Поиск по всему прпоекту сейчас тупой, нужен лучше

