import { css } from '@emotion/react';
import { type FC, type ReactNode } from 'react';
import ColorizedPreformattedText from '../ColorizedPreformattedText.js';
import { outputSectionGroupGap, outputSectionLabelStyles } from '../renderDataValue/renderDataValueStyles.js';

const structuredNodeOutputCss = css`
  display: flex;
  flex-direction: column;
  gap: ${outputSectionGroupGap};

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

  .fullscreen-output-body.wrap-lines & .structured-node-output-source pre {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }

  .fullscreen-output-body.no-wrap-lines & .structured-node-output-source pre {
    white-space: pre;
    overflow-wrap: normal;
  }

  .structured-node-output-error {
    color: var(--error-light);
  }
`;

export const StructuredNodeOutput: FC<{
  children?: ReactNode;
  errorMessage?: string;
  parsedSource?: string;
  parsedSourceLabel?: string;
  parsedSourceLanguage?: string;
}> = ({ children, errorMessage, parsedSource, parsedSourceLabel, parsedSourceLanguage }) => (
  <div css={structuredNodeOutputCss}>
    {errorMessage !== undefined && <div className="structured-node-output-error">{errorMessage}</div>}
    {children}
    {parsedSource !== undefined && parsedSourceLanguage && (
      <ParsedSourceOutputSection
        label={parsedSourceLabel ?? 'Parsed expression'}
        source={parsedSource}
        language={parsedSourceLanguage}
      />
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
      <em css={outputSectionLabelStyles} className="port-id-label">
        {label}
      </em>
    </div>
    {children}
  </div>
);

const ParsedSourceOutputSection: FC<{
  label: string;
  language: string;
  source: string;
}> = ({ label, language, source }) => (
  <StructuredNodeOutputSection label={label} className="structured-node-output-source">
    <ColorizedPreformattedText text={source} language={language} />
  </StructuredNodeOutputSection>
);
