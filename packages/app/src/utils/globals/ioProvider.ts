import { BrowserIOProvider } from '../../io/BrowserIOProvider.js';
import { type IOProvider } from '../../io/IOProvider.js';
import { LegacyBrowserIOProvider } from '../../io/LegacyBrowserIOProvider.js';
import { TauriIOProvider } from '../../io/TauriIOProvider.js';
import { datasetProvider } from './datasetProvider.js';

let ioProvider: IOProvider;

if (TauriIOProvider.isSupported()) {
  ioProvider = new TauriIOProvider(datasetProvider);
} else if (BrowserIOProvider.isSupported()) {
  ioProvider = new BrowserIOProvider();
} else {
  ioProvider = new LegacyBrowserIOProvider();
}

export { ioProvider };
