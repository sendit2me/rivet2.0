import { useAtom, useAtomValue } from 'jotai';
import { useEffect, useMemo, useRef } from 'react';
import type { ChartNode } from '@ironclad/rivet-core';
import { graphState } from '../state/graph';
import { searchingGraphState } from '../state/graphBuilder';
import { useNodeTypes } from './useNodeTypes';
import { useDependsOnPlugins } from './useDependsOnPlugins';
import { useProjectNodeRegistry } from './useProjectNodeRegistry';
import { projectState } from '../state/savedGraphs';
import {
  buildProjectGraphSearchItems,
  clampGraphSearchSelectedIndex,
  type GraphSearchNodeMetadata,
  type GraphSearchMatch,
  searchGraphNodesWithMode,
} from './graphSearch';

type SearchableEditorDefinition = {
  type: string;
  dataKey?: string;
  editors?: SearchableEditorDefinition[];
};

export function useSearchGraph() {
  const project = useAtomValue(projectState);
  const currentGraph = useAtomValue(graphState);
  const [searchState, setSearchState] = useAtom(searchingGraphState);

  useDependsOnPlugins();
  const nodeTypes = useNodeTypes();
  const projectNodeRegistry = useProjectNodeRegistry();
  const previousQueryRef = useRef(searchState.query);
  const hasSearchQuery = searchState.searching && searchState.query.trim().length > 0;

  const searchableNodes = useMemo(() => {
    if (!hasSearchQuery) {
      return [];
    }

    const searchableGraphs =
      currentGraph.metadata?.id != null
        ? { ...project.graphs, [currentGraph.metadata.id]: currentGraph }
        : project.graphs;

    return buildProjectGraphSearchItems(searchableGraphs, (node: ChartNode): GraphSearchNodeMetadata => {
      const nodeTypeLabel = node.type in nodeTypes ? projectNodeRegistry.getDynamicDisplayName(node.type) : node.type;

      return {
        nodeTypeLabel,
        searchableContentKeys: getSearchableContentKeys(node, projectNodeRegistry),
      };
    });
  }, [currentGraph, hasSearchQuery, nodeTypes, project.graphs, projectNodeRegistry]);

  const searchResult = useMemo(
    () => (hasSearchQuery ? searchGraphNodesWithMode(searchableNodes, searchState.query) : { matches: [], fallbackToTerms: false }),
    [hasSearchQuery, searchState.query, searchableNodes],
  );

  useEffect(() => {
    const queryChanged = previousQueryRef.current !== searchState.query;
    previousQueryRef.current = searchState.query;

    setSearchState((current) => {
      if (current.searching !== searchState.searching || current.query !== searchState.query) {
        return current;
      }

      if (!current.searching) {
        return current.matches.length === 0 && current.selectedIndex === 0 && !current.fallbackToTerms
          ? current
          : { ...current, matches: [], fallbackToTerms: false, selectedIndex: 0 };
      }

      const nextSelectedIndex = queryChanged ? 0 : clampGraphSearchSelectedIndex(current.selectedIndex, searchResult.matches.length);

      if (
        current.selectedIndex === nextSelectedIndex &&
        current.fallbackToTerms === searchResult.fallbackToTerms &&
        areGraphSearchMatchesEqual(current.matches, searchResult.matches)
      ) {
        return current;
      }

      return {
        ...current,
        matches: searchResult.matches,
        fallbackToTerms: searchResult.fallbackToTerms,
        selectedIndex: nextSelectedIndex,
      };
    });
  }, [searchResult, searchState.query, searchState.searching, setSearchState]);
}

function getSearchableContentKeys(
  node: ChartNode,
  projectNodeRegistry: ReturnType<typeof useProjectNodeRegistry>,
): string[] {
  try {
    const editors = projectNodeRegistry.createDynamicImpl(node).getEditors(undefined as never);
    return Array.isArray(editors) ? getCodeEditorDataKeys(editors as SearchableEditorDefinition[]) : [];
  } catch {
    return [];
  }
}

function getCodeEditorDataKeys(editors: readonly SearchableEditorDefinition[]): string[] {
  const dataKeys = new Set<string>();

  for (const editor of editors) {
    if (editor.type === 'code' && typeof editor.dataKey === 'string') {
      dataKeys.add(editor.dataKey);
    }

    if (Array.isArray(editor.editors)) {
      getCodeEditorDataKeys(editor.editors).forEach((dataKey) => dataKeys.add(dataKey));
    }
  }

  return [...dataKeys];
}

function areGraphSearchMatchesEqual(first: readonly GraphSearchMatch[], second: readonly GraphSearchMatch[]): boolean {
  return (
    first.length === second.length &&
    first.every((value, index) => {
      const other = second[index];

      return (
        other != null &&
        value.kind === other.kind &&
        value.graphId === other.graphId &&
        value.graphName === other.graphName &&
        value.locations.join('|') === other.locations.join('|') &&
        value.contentSnippets.join('|') === other.contentSnippets.join('|') &&
        (value.kind !== 'node' ||
          (other.kind === 'node' &&
            value.nodeId === other.nodeId &&
            value.nodeTitle === other.nodeTitle &&
            value.nodeType === other.nodeType))
      );
    })
  );
}
