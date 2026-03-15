import type { ChartNode } from './NodeBase.js';

export function findStronglyConnectedComponents(
  nodes: ChartNode[],
  getAdjacentNodes: (node: ChartNode) => ChartNode[],
): ChartNode[][] {
  const stack: ChartNode[] = [];
  const indices = new Map<ChartNode, number>();
  const lowLinks = new Map<ChartNode, number>();
  const onStack = new Set<ChartNode>();
  const stronglyConnectedComponents: ChartNode[][] = [];
  let index = 0;

  const strongConnect = (node: ChartNode): void => {
    indices.set(node, index);
    lowLinks.set(node, index);
    index++;
    stack.push(node);
    onStack.add(node);

    for (const adjacentNode of getAdjacentNodes(node)) {
      if (!indices.has(adjacentNode)) {
        strongConnect(adjacentNode);
        lowLinks.set(node, Math.min(lowLinks.get(node)!, lowLinks.get(adjacentNode)!));
      } else if (onStack.has(adjacentNode)) {
        lowLinks.set(node, Math.min(lowLinks.get(node)!, indices.get(adjacentNode)!));
      }
    }

    if (lowLinks.get(node) === indices.get(node)) {
      const component: ChartNode[] = [];
      let currentNode: ChartNode | undefined;

      do {
        currentNode = stack.pop();
        if (!currentNode) {
          break;
        }

        onStack.delete(currentNode);
        component.push(currentNode);
      } while (currentNode !== node);

      stronglyConnectedComponents.push(component);
    }
  };

  for (const node of nodes) {
    if (!indices.has(node)) {
      strongConnect(node);
    }
  }

  return stronglyConnectedComponents;
}
