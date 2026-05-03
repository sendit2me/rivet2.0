import { type NodeConnection, type ChartNode } from '@valerypopoff/rivet2-core';
import { atom } from 'jotai';

export type NodesClipboardItem = {
  type: 'nodes';
  nodes: ChartNode[];
  connections: NodeConnection[];
};

export type ClipboardItem = NodesClipboardItem;

export const clipboardState = atom<ClipboardItem | undefined>(undefined);
