import { type FC } from 'react';
import { PromptDesignerTestGroupResultList } from './PromptDesignerComponents.js';
import type { PromptDesignerTestGroupResults } from '../../state/promptDesigner.js';

export const PromptDesignerResponsePane: FC<{
  response: string | undefined;
  results: PromptDesignerTestGroupResults[] | undefined;
}> = ({ response, results }) => {
  return (
    <>
      {results?.length ? (
        <PromptDesignerTestGroupResultList results={results} />
      ) : (
        <pre className="pre-wrap response-text">{response ?? ''}</pre>
      )}
    </>
  );
};
