import { css } from '@emotion/react';
import { type FC, type ReactNode } from 'react';
import ColorizedPreformattedText from '../ColorizedPreformattedText.js';

const structuredNodeOutputCss = css`
  display: flex;
  flex-direction: column;
  gap: 8px;

  .structured-node-output-section {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .structured-node-output-source pre {
    margin: 0;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .structured-node-output-error {
    color: var(--error-light);
  }
`;

export const StructuredNodeOutput: FC<{
  children?: ReactNode;
  errorMessage?: string;
  parsedSource?: string;
  parsedSourceLanguage?: string;
}> = ({ children, errorMessage, parsedSource, parsedSourceLanguage }) => (
  <div css={structuredNodeOutputCss}>
    {errorMessage !== undefined && <div className="structured-node-output-error">{errorMessage}</div>}
    {children}
    {parsedSource !== undefined && parsedSourceLanguage && (
      <ParsedSourceOutputSection source={parsedSource} language={parsedSourceLanguage} />
    )}
  </div>
);

export const StructuredNodeOutputSection: FC<{
  children: ReactNode;
  className?: string;
  label: string;
}> = ({ children, className, label }) => (
  <div className={className ? `structured-node-output-section ${className}` : 'structured-node-output-section'}>
    <div>
      <em className="port-id-label">{label}</em>
    </div>
    {children}
  </div>
);

const ParsedSourceOutputSection: FC<{
  language: string;
  source: string;
}> = ({ language, source }) => (
  <StructuredNodeOutputSection label="Parsed expression" className="structured-node-output-source">
    <ColorizedPreformattedText text={source} language={language} />
  </StructuredNodeOutputSection>
);

export function getSortedSplitOutputEntries<T>(splitOutputData: Record<string, T> | undefined): Array<[string, T]> {
  return Object.entries(splitOutputData ?? {}).sort(([left], [right]) => Number(left) - Number(right));
}
