import type { monaco } from '../utils/monaco.js';

type BuildCodeEditorCreateOptionsArgs = {
  theme?: string;
  language?: string;
  text: string;
  readOnly?: boolean;
  scrollBeyondLastLine?: boolean;
  enableFolding?: boolean;
};

type GetNodeEditorCodeEditorMountKeyArgs = {
  nodeId?: string;
  fieldIdentity?: string;
  language?: string;
  theme?: string;
  enableFolding?: boolean;
};

export function resolveCodeEditorTheme(theme: string | undefined, appTheme: string | undefined): string | undefined {
  return theme === 'prompt-interpolation' && appTheme ? `prompt-interpolation-${appTheme}` : theme;
}

export function buildCodeEditorCreateOptions({
  theme,
  language,
  text,
  readOnly,
  scrollBeyondLastLine,
  enableFolding,
}: BuildCodeEditorCreateOptionsArgs): monaco.editor.IStandaloneEditorConstructionOptions {
  return {
    theme: theme ?? 'vs-dark',
    lineNumbers: 'on',
    glyphMargin: false,
    folding: enableFolding ?? false,
    foldingStrategy: enableFolding ? 'auto' : undefined,
    showFoldingControls: enableFolding ? 'mouseover' : undefined,
    foldingHighlight: enableFolding ? true : undefined,
    unfoldOnClickAfterEndOfLine: enableFolding ? false : undefined,
    lineNumbersMinChars: 2,
    language,
    minimap: {
      enabled: false,
    },
    wordWrap: 'on',
    readOnly,
    value: text,
    scrollBeyondLastLine,
  };
}

export function getNodeEditorCodeEditorMountKey({
  nodeId,
  fieldIdentity,
  language,
  theme,
  enableFolding,
}: GetNodeEditorCodeEditorMountKeyArgs): string {
  return [
    nodeId ?? 'node-editor',
    fieldIdentity ?? 'field',
    language ?? 'language',
    theme ?? 'theme',
    enableFolding ? 'folding-on' : 'folding-off',
  ].join('::');
}
