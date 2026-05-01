import { type ContextMenuItem } from '../hooks/useContextMenuConfiguration.js';

export interface ContextMenuSearchPresentation {
  primaryItems: ContextMenuItem[];
  graphItems: ContextMenuItem[];
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
    primaryItems,
    graphItems,
  };
}
