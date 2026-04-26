


- Change how the node output view renders lists. I don't like how it renders them now with the lines between items

- Check opening and saving files in the web rivet. Crtl+S and Ctrl+O don't work

- Reassess the Rivet settings. probbaly something needs reworking

- Every node (Or Code + Expression + HTTP) should have a "Do not throw" switcher so I can safely fallback with coalesce

- Update the rivet version (at least in the Settings popup)



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


