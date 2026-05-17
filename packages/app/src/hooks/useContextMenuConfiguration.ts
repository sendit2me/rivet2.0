import { type ComponentType, useMemo } from 'react';
import { useContextMenuAddNodeConfiguration } from './useContextMenuAddNodeConfiguration.js';
import DeleteIcon from 'majesticons/line/delete-bin-line.svg?react';
import SettingsCogIcon from 'majesticons/line/settings-cog-line.svg?react';
import DuplicateIcon from 'majesticons/line/image-multiple-line.svg?react';
import PlayIcon from 'majesticons/line/play-circle-line.svg?react';
import CopyIcon from '../assets/icons/copy-icon.svg?react';
import PasteIcon from '../assets/icons/paste-icon.svg?react';
import PlusIcon from 'majesticons/line/plus-line.svg?react';
import { type ChartNode, type NodeId } from '@valerypopoff/rivet2-core';
import { selectedNodesState } from '../state/graphBuilder.js';
import { useContextMenuCommands } from './useContextMenuCommands.js';
import { clipboardState } from '../state/clipboard';
import { useAtomValue } from 'jotai';
import { SubgraphLinkIcon } from '../components/visualNode/SubgraphLinkIcon.js';

export type ContextMenuConfig = {
  contexts: ContextMenuContextConfig;
  commands: ContextMenuItem[];
};

export type ContextMenuContextConfig = {
  [key: string]: ContextMenuContextConfigContext;
};

export type ContextMenuContextConfigContext<Context = unknown> = {
  contextType: Context;
  items: readonly ContextMenuItem<Context>[];
};

export type ContextMenuSearchSection = 'graphs';

export type ContextMenuItem<Context = unknown, Data = unknown> = {
  id: string;
  label: string;
  subLabel?: string;
  searchSection?: ContextMenuSearchSection;
  icon?: ComponentType;
  tone?: 'default' | 'danger';
  separatorBefore?: boolean;
  data?: Data | ((context: Context) => Data);
  conditional?: (context: Context) => boolean;
  items?: readonly ContextMenuItem<Context>[];
  infoBox?: {
    title: string;
    description: string;
    image?: string;
  };
  hiddenUntilSearched?: boolean;
};

export type ContextMenuConfiguration = ReturnType<typeof useContextMenuConfiguration>;

const type = <T>() => undefined! as T;

type NodeContextMenuData = {
  nodeType: ChartNode['type'];
  nodeId: NodeId;
  canRunFromEditor: boolean;
  canRunFromHere: boolean;
};

const getNodeContextMenuData = (context: unknown): NodeContextMenuData | undefined => {
  if (!context || typeof context !== 'object') {
    return undefined;
  }

  const data = context as Partial<NodeContextMenuData>;
  if (
    typeof data.nodeType !== 'string' ||
    typeof data.nodeId !== 'string' ||
    typeof data.canRunFromEditor !== 'boolean' ||
    typeof data.canRunFromHere !== 'boolean'
  ) {
    return undefined;
  }

  return {
    nodeType: data.nodeType as ChartNode['type'],
    nodeId: data.nodeId as NodeId,
    canRunFromEditor: data.canRunFromEditor,
    canRunFromHere: data.canRunFromHere,
  };
};

const isExecutableNodeContext = (context: unknown) => {
  const data = getNodeContextMenuData(context);
  return data != null && data.canRunFromEditor && data.nodeType !== 'comment';
};

const canRunFromHere = (context: unknown) => {
  const data = getNodeContextMenuData(context);
  return data != null && data.canRunFromEditor && data.nodeType !== 'comment' && data.canRunFromHere;
};

const isSubgraphNodeContext = (context: unknown) => getNodeContextMenuData(context)?.nodeType === 'subGraph';

export function useContextMenuConfiguration() {
  const addMenuConfig = useContextMenuAddNodeConfiguration();
  const commands = useContextMenuCommands();
  const selectedNodeIds = useAtomValue(selectedNodesState);
  const clipboard = useAtomValue(clipboardState);

  const config = useMemo(
    () =>
      ({
        // Defines the "contexts" that the context menu can show, i.e. what you've right clicked on.
        contexts: {
          node: {
            contextType: type<NodeContextMenuData>(),
            items: [
              {
                id: 'node-run-to-here',
                label: 'Run to here',
                icon: PlayIcon,
                conditional: isExecutableNodeContext,
              },
              {
                id: 'node-run-from-here',
                label: 'Run from here',
                icon: PlayIcon,
                conditional: canRunFromHere,
              },
              {
                id: 'node-copy',
                label: 'Copy',
                icon: CopyIcon,
                separatorBefore: true,
              },
              {
                id: 'node-duplicate',
                label: 'Duplicate',
                icon: DuplicateIcon,
              },
              {
                id: 'node-go-to-subgraph',
                label: 'Go to subgraph',
                icon: SubgraphLinkIcon,
                conditional: isSubgraphNodeContext,
              },
              {
                id: 'node-edit',
                label: 'Edit',
                icon: SettingsCogIcon,
              },
              {
                id: 'nodes-factor-into-subgraph',
                label: 'Create Subgraph',
                icon: DuplicateIcon,
                conditional: () => selectedNodeIds.length > 0,
              },
              {
                id: 'node-delete',
                label: 'Delete',
                icon: DeleteIcon,
                tone: 'danger',
                separatorBefore: true,
              },
            ],
          },
          blankArea: {
            contextType: type<{}>(),
            items: [
              {
                id: 'add',
                label: 'Add',
                items: addMenuConfig,
                icon: PlusIcon,
              },
              {
                id: 'paste',
                label: 'Paste',
                icon: PasteIcon,
                conditional: () => clipboard !== undefined,
              },
            ],
          },
          graphList: {
            contextType: type<{}>(),
            items: [],
          },
          graphListGraph: {
            contextType: type<{}>(),
            items: [],
          },
        },
        commands,
      }) as const satisfies ContextMenuConfig,
    [addMenuConfig, selectedNodeIds.length, commands, clipboard],
  );

  return config;
}
