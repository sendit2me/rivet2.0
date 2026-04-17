import { type GraphId } from '@ironclad/rivet-core';
import { type PluginState } from '../../state/plugins.js';
import { type GraphReachabilityBucket, type GraphReachabilityReport } from '../../utils/graphReachability.js';

export type GraphListReachabilityPresentation = {
  bucketByGraphId: Record<GraphId, GraphReachabilityBucket>;
  showUnusedBadges: boolean;
  notice?: string;
};

type GraphListReachabilityPluginState = Pick<PluginState, 'loaded' | 'error'>;

export function buildGraphListReachabilityPresentation(options: {
  report: GraphReachabilityReport;
  graphIds: GraphId[];
  plugins: GraphListReachabilityPluginState[];
}): GraphListReachabilityPresentation {
  const { report, graphIds, plugins } = options;
  const bucketByGraphId = {} as Record<GraphId, GraphReachabilityBucket>;

  for (const graphId of graphIds) {
    bucketByGraphId[graphId] = getBucketForGraph(graphId, report);
  }

  const waitingForPlugins = plugins.some((plugin) => !plugin.loaded && !plugin.error);
  if (waitingForPlugins) {
    return {
      bucketByGraphId,
      showUnusedBadges: false,
      notice: 'Unused graph analysis is waiting for project plugins to load.',
    };
  }

  if (report.status === 'blocked') {
    return {
      bucketByGraphId,
      showUnusedBadges: false,
      notice: 'Set a valid Main Graph in Project settings to see unused graphs.',
    };
  }

  if (report.status === 'partial') {
    return {
      bucketByGraphId,
      showUnusedBadges: true,
      notice: 'Unused graph analysis may be incomplete for third-party plugin nodes.',
    };
  }

  return {
    bucketByGraphId,
    showUnusedBadges: true,
  };
}

function getBucketForGraph(graphId: GraphId, report: GraphReachabilityReport): GraphReachabilityBucket {
  if (report.definite.has(graphId)) {
    return 'definitely-reachable';
  }

  if (report.dynamic.has(graphId)) {
    return 'dynamically-reachable';
  }

  return 'unreachable';
}
