import { type DataValue } from '@valerypopoff/rivet2-core';

// Re-export individual singletons for backward compatibility.
// New code should use useProviders() from '../providers/ProvidersContext' instead.
export * from './globals/datasetProvider.js';
export * from './globals/ioProvider.js';
export * from './globals/audioProvider.js';
export * from './globals/globalDataRefs.js';
