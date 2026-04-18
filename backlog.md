- From time to time when I add nodes and not save yet, and then navigate around (opening other projects and other graphs) when I get back to the graph, the node dosappears.




- Add mid points to connections so I can do neat wiring


- I don't think the file icons in the project tabs are needed. They just take up space

- When I click a node with shoft, it geth selected but the border is white, not yellow. If I click several node in a row with whift, the last clicked node is with a white border intead of the yellow. What is the logic behind it? Why?

- When the output is large and it is paged, the page size seems to be too small. I need to check. It affects the search

- The "Go to next graph" and "Go to previous graph" buttons that appear next to the graph list. When I collapse the left panel with the graphs list, the buttons should travel along, staying close to the right edge of the collapsed graphs list



- In the text editor (and similar editors), when I add variables, sometimes the input connections break. When I start typing out a new variable, the syntax breaks and the "12" var becomes "{{12" and the connection disappers
{{11}}
{{
{{12}}
{{13}}
Also id I cut - paste the "{{12}}", it breaks on the way because Rivet sees that it's gone for a second. So I canr move the variables around the text

- Workspace tabs are not teh same as "File" tab. File is not a tab at all, it shouldn't be a tab


- The each node's settings panel header is a mess. It takes up too much space


- When HTTP node gets "fetch failed", it just errors instead of generating a meaningful signal. Code node too. I'd want to have a "catch" output I guess
- HTTP node - emit fetch failed and other errors like invalid url as a separate output or something. So we can catch that in runtime instead of failing the workflow

- When I move the canvas around, it's smooth but it not keeping up with the cursor movement. It feels like it's lagging behind

- I want to be able to adjust the node height when it's not hovered so I can see this much of the content in the output section


- The run button is pushing down the node settings window. It's better to put the run button to a place where it doesn't dishelp


- New Nodes for working with lists: filtering, mapping, reducing, etc.


- When editing the code node inputs and outputs, the return object should be rewritten accordingly??? At least when it's not altered yet???



- Новый ИИ нод долен принимать низкоуровневые параметры типа массива инпутов где я сам проставляю роли. Но ризонинг например доложен быть унифицирован чтобы стаивть минимальный или нулевойю Также должен быть стриминг, но непонятно зачем — куда его пробрасывать - может перпедавать во внешний вызов функции? Или прям устанавливать вебсокет соединение с чем-то? 

- Когда какой-то нод долго выполняется (например считывается из файла 100мб), весь апп тормозит

- Поиск по всему прпоекту сейчас тупой, нужен лучше

