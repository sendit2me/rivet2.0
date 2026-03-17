import { useAtomValue, useSetAtom } from 'jotai';
import { nodesState } from '../state/graph';
import { useEffect, useMemo } from 'react';
import { entries } from '../../../core/src/utils/typeSafety';
import { searchMatchingNodeIdsState, searchingGraphState } from '../state/graphBuilder';
import { useFuseSearch } from './useFuseSearch';
import { useFocusOnNodes } from './useFocusOnNodes';
import { useNodeTypes } from './useNodeTypes';
import { useDependsOnPlugins } from './useDependsOnPlugins';
import { useProjectNodeRegistry } from './useProjectNodeRegistry';

export function useSearchGraph() {
  const graphNodes = useAtomValue(nodesState);
  const setSearchMatchingNodes = useSetAtom(searchMatchingNodeIdsState);

  useDependsOnPlugins();
  const focusOnNodes = useFocusOnNodes();
  const nodeTypes = useNodeTypes();
  const projectNodeRegistry = useProjectNodeRegistry();

  const searchableNodes = useMemo(() => {
    return graphNodes.map((node) => {
      const joinedData = entries(node.data as object).map(([key, value]) => {
        return `${value}`;
      });

      const isKnownNodeType = node.type in nodeTypes;

      const searchableNode = {
        title: node.title,
        description: node.description,
        id: node.id,
        joinedData: joinedData.join(' '),
        nodeType: isKnownNodeType ? projectNodeRegistry.getDynamicDisplayName(node.type) : '',
      };

      return searchableNode;
    });
  }, [graphNodes, nodeTypes, projectNodeRegistry]);

  const searchState = useAtomValue(searchingGraphState);

  const searchedNodes = useFuseSearch(
    searchableNodes,
    searchState.query,
    ['title', 'description', 'joinedData', 'nodeType'],
    {
      enabled: searchState.searching,
      noInputEmptyList: true,
    },
  );

  useEffect(() => {
    setSearchMatchingNodes(searchedNodes.map((n) => n.item.id));

    if (searchedNodes.length > 0) {
      focusOnNodes(searchedNodes.map((n) => n.item.id));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bleh
  }, [searchState.query, searchState.searching]);
}
