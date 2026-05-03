import { useMarkdown } from '../../hooks/useMarkdown.js';
import {
  type AudioDataValue,
  type BinaryDataValue,
  type ChatMessageDataValue,
  type ChatMessageMessagePart,
  type DataType,
  type DocumentDataValue,
  type ImageDataValue,
  inferType,
  type ScalarDataType,
  type ScalarDataValue,
} from '@valerypopoff/rivet2-core';
import prettyBytes from 'pretty-bytes';
import { useMemo, type FC } from 'react';
import { match } from 'ts-pattern';
import type { DataValueRendererProps } from './createDataValueRendererMap.js';
import ColorizedPreformattedText from '../ColorizedPreformattedText.js';
import { RenderChatMessagePart } from './RenderChatMessagePart.js';
import { COMPACT_PREVIEW_MAX_CHARS, COMPACT_PREVIEW_MAX_LINES } from '../../utils/outputStorageLimits.js';
import { getRenderedStringText } from './stringPreview.js';
import { buildTextPreviewExcerpt } from '../../utils/textPreview.js';
import { getRenderableAssistantFunctionCall } from './chatMessageRenderUtils.js';

export type ScalarRendererProps<T extends DataType = DataType> = {
  value: Extract<ScalarDataValue, { type: T }>;
  depth?: number;
  renderMarkdown?: boolean;
  truncateLength?: number;
  isCompact?: boolean;
  mode?: DataValueRendererProps['mode'];
  allowLargeStoredValueActions?: boolean;
};

export function createScalarRenderers(options: { renderValue: (props: DataValueRendererProps) => JSX.Element }) {
  const { renderValue } = options;

  /* eslint-disable react-hooks/rules-of-hooks -- table-driven renderers */
  const scalarRenderers: {
    [P in ScalarDataType]: FC<ScalarRendererProps<P>>;
  } = {
    boolean: ({ value }) => <>{value.value ? 'true' : 'false'}</>,
    number: ({ value }) => <>{value.value}</>,
    string: ({ value, renderMarkdown, truncateLength, isCompact }) => {
      const truncated = getRenderedStringText(value.value, { truncateLength, isCompact });

      const markdownEnabled = !!renderMarkdown && !isCompact;
      const markdownRendered = useMarkdown(truncated, markdownEnabled);

      if (markdownEnabled) {
        return <div className="markdown-body rivet-markdown-output" dangerouslySetInnerHTML={markdownRendered} />;
      }

      return <pre className="pre-wrap">{truncated}</pre>;
    },
    'chat-message': ({ value, renderMarkdown, isCompact, allowLargeStoredValueActions }) => {
      const { value: realValue } = value as ChatMessageDataValue;
      let parts = Array.isArray(realValue.message) ? realValue.message : [realValue.message];

      if (isCompact && parts.length > 1) {
        parts = parts.slice(0, 1);
      }

      const renderString = (part: string) => {
        const Renderer = scalarRenderers.string;
        return (
          <Renderer value={{ type: 'string', value: part }} renderMarkdown={renderMarkdown} isCompact={isCompact} />
        );
      };

      const messageContent = (
        <div className="message-content">
          {parts.map((part: ChatMessageMessagePart, index) => (
            <div className="chat-message-message-part" key={index}>
              <RenderChatMessagePart part={part} renderString={renderString} />
            </div>
          ))}
        </div>
      );

      return match(realValue)
        .with({ type: 'system' }, () => (
          <div className="chat-message system">
            <header>
              <em>system</em>
            </header>
            {messageContent}
          </div>
        ))
        .with({ type: 'user' }, () => (
          <div className="chat-message user">
            <header>
              <em>user</em>
            </header>
            {messageContent}
          </div>
        ))
        .with({ type: 'assistant' }, (message) => {
          const functionCall = getRenderableAssistantFunctionCall(message);

          return (
            <div className="chat-message assistant">
              <header>
                <em>assistant</em>
              </header>
              {messageContent}
              {functionCall?.type === 'multiple' ? (
                <div className="function-calls">
                  <h4>Function Calls:</h4>
                  <div className="pre-wrap">
                    {functionCall.functionCalls.map((fc, index) => (
                      <div key={index}>{renderValue({ value: inferType(fc), allowLargeStoredValueActions })}</div>
                    ))}
                  </div>
                </div>
              ) : (
                functionCall?.type === 'single' && (
                  <div className="function-call">
                    <h4>Function Call:</h4>
                    <div className="pre-wrap">
                      {renderValue({ value: inferType(functionCall.functionCall), allowLargeStoredValueActions })}
                    </div>
                  </div>
                )
              )}
            </div>
          );
        })
        .with({ type: 'function' }, (message) => (
          <div className="chat-message function">
            <header>
              <em>function output for: {message.name}</em>
            </header>
            {messageContent}
          </div>
        ))
        .otherwise(() => (
          <div className="chat-message unknown">
            <header>
              <em>unknown</em>
            </header>
            {messageContent}
          </div>
        ));
    },
    date: ({ value }) => <>{value.value}</>,
    time: ({ value }) => <>{value.value}</>,
    datetime: ({ value }) => <>{value.value}</>,
    'control-flow-excluded': () => <>Not ran</>,
    any: ({ value, depth, renderMarkdown, isCompact, mode, truncateLength, allowLargeStoredValueActions }) => {
      const inferred = inferType(value.value);
      if (inferred.type === 'any') {
        return <>{JSON.stringify(inferred.value)}</>;
      }
      return renderValue({
        value: inferred,
        depth: (depth ?? 0) + 1,
        renderMarkdown,
        isCompact,
        mode,
        truncateLength,
        allowLargeStoredValueActions,
      });
    },
    object: ({ value, isCompact }) => {
      let stringified = JSON.stringify(value.value, null, 2);

      if (isCompact) {
        stringified = buildTextPreviewExcerpt(stringified, {
          maxChars: COMPACT_PREVIEW_MAX_CHARS,
          maxLines: COMPACT_PREVIEW_MAX_LINES,
        }).text;
        return <pre className="pre-wrap">{stringified}</pre>;
      }

      return (
        <div className="rendered-object-type">
          <ColorizedPreformattedText text={stringified} language="json" />
        </div>
      );
    },
    'gpt-function': ({ value }) => (
      <>
        GPT Function: <em>{value.value.name}</em>
      </>
    ),
    vector: ({ value }) => <>Vector (length {value.value.length})</>,
    image: ({ value }) => {
      const imageValue = value as ImageDataValue;
      const imageUrl = useMemo(() => {
        const blob = new Blob([imageValue.value.data], { type: imageValue.value.mediaType });
        return URL.createObjectURL(blob);
      }, [imageValue.value.data, imageValue.value.mediaType]);

      return (
        <div>
          <img src={imageUrl} alt="" />
        </div>
      );
    },
    binary: ({ value }) => {
      const binaryValue = value as BinaryDataValue;
      return <>Binary (length {binaryValue.value.length.toLocaleString()})</>;
    },
    audio: ({ value }) => {
      const audioValue = value as AudioDataValue;
      const dataUri = useMemo(() => {
        const blob = new Blob([audioValue.value.data], { type: audioValue.value.mediaType });
        return URL.createObjectURL(blob);
      }, [audioValue.value.data, audioValue.value.mediaType]);

      return (
        <div>
          <audio controls>
            <source src={dataUri} />
          </audio>
        </div>
      );
    },
    'graph-reference': ({ value }) => {
      return <div>(Reference to graph &quot;{value.value.graphName}&quot;)</div>;
    },
    document: ({ value }) => {
      const documentValue = value as DocumentDataValue;

      return (
        <div>
          <p>
            {documentValue.value.title ? `Document: ${documentValue.value.title}` : 'Document'} (
            {documentValue.value.mediaType})
          </p>
          {documentValue.value.context && <p>{documentValue.value.context}</p>}
          {documentValue.value.enableCitations && <p>(Citations enabled)</p>}
          Size: {documentValue.value.data.length > 0 ? prettyBytes(documentValue.value.data.length) : '0 bytes'}
        </div>
      );
    },
  };
  /* eslint-enable react-hooks/rules-of-hooks -- table-driven renderers */

  return scalarRenderers;
}
