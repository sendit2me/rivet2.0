- Check opening and saving files in the web rivet. Crtl+S and Ctrl+O don't work
- In the "File" menu, probably need to have "Dave project" item. (not only "save as")

- Reassess the Rivet settings. probbaly something needs reworking



- get back the split node summary into node's header

- In remote debugging, come up with some ID that can be passed when running so that I can "catch" only the target runs of the workflow


- In the output full popup when the markdown mode is on, I wandt to make it better, just like in https://markdownlivepreview.com/



- Support Python in all nodes that support javascript


- Update the rivet version (at least in the Settings popup)



- Convenient node type browser, just like in n8n


- For all three nodes, add the "Show 'Parsed expression' in non-error outputs" switcher in the node settings (after the code snippet). Make it that default to off.

- A way to throw the error into the workflow response whenever the workflow breaks and ends





- Nodes for working with lists: get element by index


- Show run time in eachnode

- Destructure node: when adding a new line, auto isert "$." into it

- Every node should have a "Do not throw" switcher so I can safely fallback with coalesce


- When the output is large and paged, the page size seems to be too small. I need to check. It affects the search

- Add mid points to connections so I can do neat wiring



- I want to be able to adjust the node height when it's not hovered so I can see this much of the content in the output section

- When editing the code node inputs and outputs, the return object should be rewritten accordingly??? At least when it's not altered yet???


- Новый ИИ нод долен принимать низкоуровневые параметры типа массива инпутов где я сам проставляю роли. Но ризонинг например доложен быть унифицирован чтобы стаивть минимальный или нулевойю Также должен быть стриминг, но непонятно зачем — куда его пробрасывать - может перпедавать во внешний вызов функции? Или прям устанавливать вебсокет соединение с чем-то? 

- Поиск по всему прпоекту сейчас тупой, нужен лучше

