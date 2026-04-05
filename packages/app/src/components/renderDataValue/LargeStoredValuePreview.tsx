import { css } from '@emotion/react';
import prettyBytes from 'pretty-bytes';
import { useEffect, useMemo, useState, type FC } from 'react';
import { useDataRefs } from '../../providers/ProvidersContext.js';
import type { StoredDataValue } from '../../state/dataFlow.js';
import {
  FULLSCREEN_CHUNK_PREVIEW_MAX_CHARS,
  FULLSCREEN_CHUNK_PREVIEW_MAX_LINES,
  FULL_RENDER_SAFE_THRESHOLD_CHARS,
} from '../../utils/outputStorageLimits.js';
import { tryRestoreStoredDataValue } from '../../utils/executionDataTransforms.js';
import ColorizedPreformattedText from '../ColorizedPreformattedText.js';
import type { OutputRenderMode } from './outputRenderTypes.js';
import { copyToClipboard } from '../../utils/copyToClipboard.js';
import { handleError } from '../../utils/errorHandling.js';

const styles = css`
  display: flex;
  flex-direction: column;
  gap: 8px;

  .preview-meta {
    color: var(--grey-lighter);
    font-size: 11px;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .preview-actions {
    display: flex;
    gap: 8px;

    button {
      cursor: pointer;
      border: 1px solid var(--grey);
      background: rgba(255, 255, 255, 0.05);
      color: inherit;
      border-radius: 4px;
      padding: 4px 8px;
    }
  }

  .missing-ref {
    color: var(--warning);
    font-size: 12px;
  }

  pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .chunk-pager {
    display: flex;
    align-items: center;
    gap: 8px;

    button {
      cursor: pointer;
      border: 1px solid var(--grey);
      background: rgba(255, 255, 255, 0.05);
      color: inherit;
      border-radius: 4px;
      width: 28px;
      height: 28px;
    }
  }
`;

export const LargeStoredValuePreview: FC<{
  value: Extract<StoredDataValue, { storage: 'ref' }>;
  mode: OutputRenderMode;
}> = ({ value, mode }) => {
  const dataRefs = useDataRefs();
  const [showFull, setShowFull] = useState(mode === 'full');
  const [chunkPage, setChunkPage] = useState(0);
  const preview = value.preview;

  useEffect(() => {
    setShowFull(mode === 'full');
    setChunkPage(0);
  }, [mode, value.refId]);

  const restoredValue = useMemo(
    () => (mode === 'compact' && !showFull ? undefined : tryRestoreStoredDataValue(value, dataRefs)),
    [dataRefs, mode, showFull, value],
  );

  const fullText = useMemo(() => {
    if (!restoredValue) {
      return undefined;
    }

    switch (restoredValue.type) {
      case 'string':
        return restoredValue.value;
      case 'string[]':
        return restoredValue.value.join('\n');
      case 'object':
      case 'object[]':
        return JSON.stringify(restoredValue.value, null, 2);
      case 'any':
      case 'any[]':
        return typeof restoredValue.value === 'string'
          ? restoredValue.value
          : JSON.stringify(restoredValue.value, null, 2);
      default:
        return undefined;
    }
  }, [restoredValue]);

  const shouldPageFullText = (fullText?.length ?? 0) > FULL_RENDER_SAFE_THRESHOLD_CHARS;
  const chunkCount = fullText ? Math.max(1, Math.ceil(fullText.length / FULLSCREEN_CHUNK_PREVIEW_MAX_CHARS)) : 1;
  const activeChunkText = useMemo(() => {
    if (!fullText) {
      return undefined;
    }

    if (!showFull) {
      return slicePreviewChunk(fullText, 0);
    }

    if (!shouldPageFullText) {
      return fullText;
    }

    return slicePreviewChunk(fullText, chunkPage * FULLSCREEN_CHUNK_PREVIEW_MAX_CHARS);
  }, [chunkPage, fullText, showFull, shouldPageFullText]);

  const showActions = mode !== 'compact';
  const missingRef = mode !== 'compact' && restoredValue == null;
  const handleCopyFullValue = () => {
    if (!fullText) {
      handleError(new Error('Value no longer available in memory'), 'Failed to copy node output');
      return;
    }

    void copyToClipboard(fullText);
  };

  const handleCopyJson = () => {
    if (!restoredValue) {
      handleError(new Error('Value no longer available in memory'), 'Failed to copy node output');
      return;
    }

    void copyToClipboard(JSON.stringify(restoredValue.value, null, 2));
  };

  return (
    <div css={styles}>
      <div className="preview-meta">
        <span>{preview.kind === 'json' ? 'JSON Preview' : 'Text Preview'}</span>
        {'totalChars' in preview && <span>{preview.totalChars.toLocaleString()} chars</span>}
        {'lineCount' in preview && <span>{preview.lineCount.toLocaleString()} lines</span>}
        {'itemCount' in preview && preview.itemCount != null && <span>{preview.itemCount.toLocaleString()} items</span>}
        {'totalBytes' in preview && preview.totalBytes != null && <span>{prettyBytes(preview.totalBytes)}</span>}
        {'encodedHint' in preview && preview.encodedHint && <span>Likely {preview.encodedHint}</span>}
      </div>

      {showActions && (
        <div className="preview-actions">
          {!showFull && <button onClick={() => setShowFull(true)}>Load Full Value</button>}
          <button onClick={handleCopyFullValue}>Copy Full Value</button>
          {preview.kind === 'json' && <button onClick={handleCopyJson}>Copy JSON</button>}
        </div>
      )}

      {missingRef ? (
        <div className="missing-ref">Value no longer available in memory.</div>
      ) : showFull && shouldPageFullText ? (
        <>
          <div className="chunk-pager">
            <button onClick={() => setChunkPage((current) => Math.max(0, current - 1))}>{'<'}</button>
            <span>
              {chunkPage + 1} / {chunkCount}
            </span>
            <button onClick={() => setChunkPage((current) => Math.min(chunkCount - 1, current + 1))}>{'>'}</button>
          </div>
          {preview.kind === 'json' ? (
            <ColorizedPreformattedText text={activeChunkText ?? ''} language="json" />
          ) : (
            <pre>{activeChunkText}</pre>
          )}
        </>
      ) : preview.kind === 'json' && showFull ? (
        <ColorizedPreformattedText text={activeChunkText ?? ''} language="json" />
      ) : (
        <pre>{showFull ? activeChunkText : preview.kind === 'summary' ? preview.label : preview.excerpt}</pre>
      )}
    </div>
  );
};

function slicePreviewChunk(text: string, offset: number): string {
  const slice = text.slice(offset, offset + FULLSCREEN_CHUNK_PREVIEW_MAX_CHARS);
  return slice.split('\n').slice(0, FULLSCREEN_CHUNK_PREVIEW_MAX_LINES).join('\n');
}
