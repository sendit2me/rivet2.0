import { cloneDeep } from 'lodash-es';
import * as monaco from 'monaco-editor';

import {
  conf as markdownConf,
  language as markdownLanguage,
} from 'monaco-editor/esm/vs/basic-languages/markdown/markdown';

export { monaco };

const PROMPT_INTERPOLATION_BRACE_CONFIGURATION: monaco.languages.LanguageConfiguration = {
  brackets: [['{', '}']],
  autoClosingPairs: [{ open: '{', close: '}' }],
  surroundingPairs: [{ open: '{', close: '}' }],
};

const PROMPT_INTERPOLATION_THEMES = {
  molten: 'ff9900',
  grapefruit: 'ff8862',
  taffy: 'd6c2ff',
  custom: 'ff9900',
} as const;

function isLanguageRegistered(id: string): boolean {
  return monaco.languages.getLanguages().some((language) => language.id === id);
}

function registerPromptInterpolationLanguage(): void {
  if (isLanguageRegistered('prompt-interpolation')) {
    return;
  }

  monaco.languages.register({ id: 'prompt-interpolation' });
  monaco.languages.setMonarchTokensProvider('prompt-interpolation', {
    tokenizer: {
      root: [[/\{\{[^}]+\}\}/, 'prompt-replacement']],
    },
  });
  monaco.languages.setLanguageConfiguration('prompt-interpolation', PROMPT_INTERPOLATION_BRACE_CONFIGURATION);
}

function registerPromptInterpolationMarkdownLanguage(): void {
  if (isLanguageRegistered('prompt-interpolation-markdown')) {
    return;
  }

  const promptInterpolationMarkdownConf = cloneDeep(markdownConf);
  const promptInterpolationMarkdownLanguage = cloneDeep(markdownLanguage);
  promptInterpolationMarkdownLanguage.tokenizer.root.unshift([/\{\{[^{}]+\}\}/, 'prompt-replacement']);

  monaco.languages.register({ id: 'prompt-interpolation-markdown' });
  monaco.languages.setMonarchTokensProvider('prompt-interpolation-markdown', promptInterpolationMarkdownLanguage);
  monaco.languages.setLanguageConfiguration('prompt-interpolation-markdown', promptInterpolationMarkdownConf);
}

function definePromptInterpolationThemes(): void {
  for (const [name, foreground] of Object.entries(PROMPT_INTERPOLATION_THEMES)) {
    monaco.editor.defineTheme(`prompt-interpolation-${name}`, {
      base: 'vs-dark',
      inherit: true,
      rules: [{ token: 'prompt-replacement', foreground }],
      colors: {},
    });
  }
}

export function ensureCodeEditorMonacoLanguages(): void {
  registerPromptInterpolationLanguage();
  registerPromptInterpolationMarkdownLanguage();
  definePromptInterpolationThemes();
}
