import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import type { GraphId, NodeId, ProjectId } from '@valerypopoff/rivet2-core';
import { createHybridStorage } from './storage.js';
import { DEFAULT_MULTILINE_EDITOR_FONT_SIZE } from '../utils/multilineEditorFontSize.js';
import { DEFAULT_UI_FONT_SIZE } from '../utils/uiFontSize.js';
import { DEFAULT_LEFT_SIDEBAR_WIDTH } from '../utils/leftSidebarWidth.js';
import type { ConnectedGraphInputUsage } from '../domain/graphEditing/graphInputUsage.js';
import { DEFAULT_HORIZONTAL_MODAL_BOUNDS, type HorizontalModalBounds } from '../utils/fullScreenModalBounds.js';
import type { NodeEditorGroupOpenState } from '../utils/nodeEditorGroupState.js';

const { storage } = createHybridStorage('ui');

export const debuggerPanelOpenState = atom<boolean>(false);

export type DebuggerPanelAnchor = {
  bottom: number;
  right: number;
};

export const debuggerPanelAnchorState = atom<DebuggerPanelAnchor | undefined>(undefined);

export type OverlayKey = 'promptDesigner' | 'trivet' | 'chatViewer' | 'dataStudio';

export const overlayOpenState = atom<OverlayKey | undefined>(undefined);

export const newProjectModalOpenState = atom<boolean>(false);

export type DeleteGraphInputConfirmState = {
  nodeIds: NodeId[];
  usages: ConnectedGraphInputUsage[];
};

export const deleteGraphInputConfirmState = atom<DeleteGraphInputConfirmState | null>(null);

export type SubGraphPortRearrangeTarget = {
  graphId: GraphId;
  nodeId: NodeId;
  projectId: ProjectId;
};

export const subGraphPortRearrangeTargetState = atom<SubGraphPortRearrangeTarget | undefined>(undefined);

export const expandedFoldersState = atomWithStorage<Record<string, boolean>>('expandedFoldersState', {}, storage);

export const showUnreachableGraphTagsState = atomWithStorage<boolean>('showUnreachableGraphTagsState', true, storage);

/**
 * Feature 005 Phase C1 — "Show overrides" preference. Off (default) CSS-hides a node's advanced /
 * override editor groups (the model-config `extraBody`), keeping the node clean and byte-identical;
 * on reveals them for power users. App-level gate because per-editor `hideIf` is data-based and
 * can't read a UI pref.
 */
export const showModelConfigOverridesState = atomWithStorage<boolean>('showModelConfigOverridesState', false, storage);

export const showGraphReferenceIndicatorsState = atomWithStorage<boolean>(
  'showGraphReferenceIndicatorsState',
  true,
  storage,
);

// Keep the storage key stable so existing saved viewport heights still load.
export const codeEditorHeightsByStorageKeyState = atomWithStorage<Record<string, number>>(
  'codeEditorHeightsByNodeTypeState',
  {},
  storage,
);

export const nodeEditorWidthState = atomWithStorage<number | null>('nodeEditorWidthState', null, storage);

export const nodeEditorGroupOpenState = atomWithStorage<NodeEditorGroupOpenState>(
  'nodeEditorGroupOpenState',
  {},
  storage,
);

export type ProjectSettingsSectionOpenState = Record<string, boolean>;

export const projectSettingsSectionOpenState = atomWithStorage<ProjectSettingsSectionOpenState>(
  'projectSettingsSectionOpenState',
  {},
  storage,
);

export const fullscreenOutputModalBoundsState = atomWithStorage<HorizontalModalBounds>(
  'fullscreenOutputModalBoundsState',
  DEFAULT_HORIZONTAL_MODAL_BOUNDS,
  storage,
);

export const graphSearchPanelHeightState = atomWithStorage<number>('graphSearchPanelHeightState', 420, storage);

export const leftSidebarWidthState = atomWithStorage<number>(
  'leftSidebarWidthState',
  DEFAULT_LEFT_SIDEBAR_WIDTH,
  storage,
);

export const leftSidebarLiveWidthState = atom<number>(DEFAULT_LEFT_SIDEBAR_WIDTH);

export const uiFontSizeState = atomWithStorage<number>('uiFontSizeState', DEFAULT_UI_FONT_SIZE, storage);

export const multilineEditorFontSizeState = atomWithStorage<number>(
  'multilineEditorFontSizeState',
  DEFAULT_MULTILINE_EDITOR_FONT_SIZE,
  storage,
);

export const helpModalOpenState = atom<boolean>(false);
