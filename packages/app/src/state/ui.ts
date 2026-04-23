import { atom } from 'jotai';
import { atomWithStorage } from 'jotai/utils';
import { createHybridStorage } from './storage.js';
import { DEFAULT_MULTILINE_EDITOR_FONT_SIZE } from '../utils/multilineEditorFontSize.js';

const { storage } = createHybridStorage('ui');

export const debuggerPanelOpenState = atom<boolean>(false);

export type DebuggerPanelAnchor = {
  bottom: number;
  right: number;
};

export const debuggerPanelAnchorState = atom<DebuggerPanelAnchor | undefined>(undefined);

export type OverlayKey = 'promptDesigner' | 'trivet' | 'chatViewer' | 'dataStudio' | 'plugins' | 'community';

export const overlayOpenState = atom<OverlayKey | undefined>(undefined);

export const newProjectModalOpenState = atom<boolean>(false);

export const expandedFoldersState = atomWithStorage<Record<string, boolean>>('expandedFoldersState', {}, storage);

// Keep the storage key stable so existing saved viewport heights still load.
export const codeEditorHeightsByStorageKeyState = atomWithStorage<Record<string, number>>(
  'codeEditorHeightsByNodeTypeState',
  {},
  storage,
);

export const nodeEditorWidthState = atomWithStorage<number | null>('nodeEditorWidthState', null, storage);

export const multilineEditorFontSizeState = atomWithStorage<number>(
  'multilineEditorFontSizeState',
  DEFAULT_MULTILINE_EDITOR_FONT_SIZE,
  storage,
);

export const helpModalOpenState = atom<boolean>(false);
