import { type DataValue } from '@rivet2/rivet-core';

// Re-export individual singletons for backward compatibility.
// New code should use useProviders() from '../providers/ProvidersContext' instead.
export * from './globals/datasetProvider.js';
export * from './globals/ioProvider.js';
export * from './globals/audioProvider.js';
export * from './globals/globalDataRefs.js';
