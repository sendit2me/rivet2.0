import { createContext, useContext } from 'react';

export const NodeEditorResizeContext = createContext(false);

export function useIsNodeEditorResizing() {
  return useContext(NodeEditorResizeContext);
}
