import { cloneDeep } from 'lodash-es';

import { conf, language } from 'monaco-editor/esm/vs/basic-languages/markdown/markdown';

const markdownPromptInterpolationConf = cloneDeep(conf);
const markdownPromptInterpolationLanguage = cloneDeep(language);

markdownPromptInterpolationLanguage.tokenizer.root.unshift([/\{\{[^{}]+\}\}/, 'prompt-replacement']);

export { markdownPromptInterpolationConf as conf };
export { markdownPromptInterpolationLanguage as language };
