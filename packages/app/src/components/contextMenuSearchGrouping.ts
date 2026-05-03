import { type ContextMenuItem } from '../hooks/useContextMenuConfiguration.js';

export interface ContextMenuSearchPresentation {
  primaryItems: ContextMenuItem[];
  graphItems: ContextMenuItem[];
}

const priorityNodeTypeSearchItems = new Map([
  ['add-node:graphInput', 0],
  ['add-node:graphOutput', 1],
]);

function orderPrimarySearchItems(items: ContextMenuItem[]) {
  const orderedItems = items
    .map((item, index) => ({
      item,
      index,
      priority: priorityNodeTypeSearchItems.get(item.id) ?? Number.POSITIVE_INFINITY,
    }))
    .sort((a, b) => a.priority - b.priority || a.index - b.index)
    .map(({ item }) => item);

  const priorityItemCount = orderedItems.filter((item) => priorityNodeTypeSearchItems.has(item.id)).length;

  if (priorityItemCount === 0 || priorityItemCount === orderedItems.length) {
    return orderedItems;
  }

  return orderedItems.map((item, index) =>
    index === priorityItemCount
      ? {
          ...item,
          separatorBefore: true,
        }
      : item,
  );
}

export function getContextMenuSearchPresentation(items: readonly ContextMenuItem[]): ContextMenuSearchPresentation {
  const primaryItems: ContextMenuItem[] = [];
  const graphItems: ContextMenuItem[] = [];

  for (const item of items) {
    if (item.searchSection === 'graphs') {
      graphItems.push(item);
    } else {
      primaryItems.push(item);
    }
  }

  return {
    primaryItems: orderPrimarySearchItems(primaryItems),
    graphItems,
  };
}
