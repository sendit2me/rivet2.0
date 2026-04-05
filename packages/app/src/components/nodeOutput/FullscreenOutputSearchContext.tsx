import { createContext, useContext } from 'react';
import type { FullscreenOutputSearchProvider } from './fullscreenOutputSearchDom.js';

type FullscreenOutputSearchContextValue = {
  registerProvider: (provider: FullscreenOutputSearchProvider) => () => void;
};

export const FullscreenOutputSearchContext = createContext<FullscreenOutputSearchContextValue | null>(null);

export function useFullscreenOutputSearchContext(): FullscreenOutputSearchContextValue | null {
  return useContext(FullscreenOutputSearchContext);
}
