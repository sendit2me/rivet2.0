import * as monaco from 'monaco-editor';

import { conf as promptInterpolationMarkdownConf, language as promptInterpolationMarkdownLanguage } from './monaco/markdown';

export { monaco };

const PROMPT_INTERPOLATION_BRACE_CONFIGURATION: monaco.languages.LanguageConfiguration = {
  brackets: [['{', '}']],
  autoClosingPairs: [{ open: '{', close: '}' }],
  surroundingPairs: [{ open: '{', close: '}' }],
};

monaco.languages.register({ id: 'prompt-interpolation' });
monaco.languages.register({ id: 'prompt-interpolation-markdown' });

monaco.languages.setMonarchTokensProvider('prompt-interpolation', {
  tokenizer: {
    root: [[/\{\{[^}]+\}\}/, 'prompt-replacement']],
  },
});

monaco.languages.setMonarchTokensProvider('prompt-interpolation-markdown', promptInterpolationMarkdownLanguage);
monaco.languages.setLanguageConfiguration('prompt-interpolation-markdown', promptInterpolationMarkdownConf);
monaco.languages.setLanguageConfiguration('prompt-interpolation', PROMPT_INTERPOLATION_BRACE_CONFIGURATION);

const definePITheme = (name: string, colors: { primary: string }) =>
  monaco.editor.defineTheme(`prompt-interpolation-${name}`, {
    base: 'vs-dark',
    inherit: true,
    rules: [{ token: 'prompt-replacement', foreground: colors.primary }],
    colors: {},
  });

definePITheme('molten', { primary: 'ff9900' });
definePITheme('grapefruit', { primary: 'ff8862' });
definePITheme('taffy', { primary: 'd6c2ff' });
