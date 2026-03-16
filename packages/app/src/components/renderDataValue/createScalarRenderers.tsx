import { useMemo, type FC } from 'react';
import {
  type AudioDataValue,
  type ChatMessageDataValue,
  type DataType,
  type DocumentDataValue,
  type ImageDataValue,
  inferType,
  type ScalarDataType,
  type ChatMessageMessagePart,
  type BinaryDataValue,
} from '@ironclad/rivet-core';
import { match } from 'ts-pattern';
import prettyBytes from 'pretty-bytes';
import ColorizedPreformattedText from '../ColorizedPreformattedText.js';
import { useMarkdown } from '../../hooks/useMarkdown.js';
import { type DataValueWithRefs, type ScalarDataValueWithRefs } from '../../state/dataFlow.js';
import { RenderChatMessagePart } from './RenderChatMessagePart.js';

export type ScalarRendererProps<T extends DataType = DataType> = {
  value: Extract<ScalarDataValueWithRefs, { type: T }>;
  depth?: number;
  renderMarkdown?: boolean;
  truncateLength?: number;
  isCompact?: boolean;
};

export function createScalarRenderers(options: {
  dataRefs: ReturnType<typeof import('../../providers/ProvidersContext.js').getDefaultProviders>['dataRefs'];
  renderValue: (value: DataValueWithRefs, depth?: number, renderMarkdown?: boolean, truncateLength?: number, isCompact?: boolean) => JSX.Element;
}) {
  const { dataRefs, renderValue } = options;

  /* eslint-disable react-hooks/rules-of-hooks -- These are components (ish) */
  const scalarRenderers: {
    [P in ScalarDataType]: FC<ScalarRendererProps<P>>;
  } = {
    boolean: ({ value }) => <>{value.value ? 'true' : 'false'}</>,
    number: ({ value }) => <>{value.value}</>,
    string: ({ value, renderMarkdown, truncateLength, isCompact }) => {
      let truncated = truncateLength ? value.value.slice(0, truncateLength) + '...' : value.value;

      if (isCompact) {
        truncated = truncated.split('\n').slice(0, 2).join('\n');
      }

      const markdownRendered = useMarkdown(truncated, renderMarkdown);

      if (renderMarkdown) {
        return <div dangerouslySetInnerHTML={markdownRendered} />;
      }

      return <pre className="pre-wrap">{truncated}</pre>;
    },
    'chat-message': ({ value, renderMarkdown, isCompact }) => {
      const resolved = dataRefs.get(value.value.ref);

      if (!resolved) {
        return <div>Could not find data.</div>;
      }

      const { value: realValue } = resolved as ChatMessageDataValue;
      let parts = Array.isArray(realValue.message) ? realValue.message : [realValue.message];

      if (isCompact && parts.length > 1) {
        parts = parts.slice(0, 1);
      }

      const renderString = (part: string) => {
        const Renderer = scalarRenderers.string;
        return <Renderer value={{ type: 'string', value: part }} renderMarkdown={renderMarkdown} isCompact={isCompact} />;
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
        .with({ type: 'assistant' }, (message) => (
          <div className="chat-message assistant">
            <header>
              <em>assistant</em>
            </header>
            {messageContent}
            {message.function_calls ? (
              <div className="function-calls">
                <h4>Function Calls:</h4>
                <div className="pre-wrap">
                  {message.function_calls.map((fc, index) => (
                    <div key={index}>{renderValue(inferType(fc) as DataValueWithRefs)}</div>
                  ))}
                </div>
              </div>
            ) : (
              message.function_call && (
                <div className="function-call">
                  <h4>Function Call:</h4>
                  <div className="pre-wrap">{renderValue(inferType(message.function_call) as DataValueWithRefs)}</div>
                </div>
              )
            )}
          </div>
        ))
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
    any: ({ value, depth, renderMarkdown }) => {
      const inferred = inferType(value.value);
      if (inferred.type === 'any') {
        return <>{JSON.stringify(inferred.value)}</>;
      }
      return renderValue(inferred as DataValueWithRefs, (depth ?? 0) + 1, renderMarkdown);
    },
    object: ({ value, isCompact }) => {
      let stringified = JSON.stringify(value.value, null, 2);

      if (isCompact) {
        stringified = stringified.split('\n').slice(0, 2).join('\n') + '\n...';
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
      const resolved = dataRefs.get(value.value.ref);
      if (!resolved) {
        return <div>Could not find data.</div>;
      }

      const {
        value: { data, mediaType },
      } = resolved as ImageDataValue;

      const imageUrl = useMemo(() => {
        const blob = new Blob([data], { type: mediaType });
        return URL.createObjectURL(blob);
      }, [data, mediaType]);

      return (
        <div>
          <img src={imageUrl} alt="" />
        </div>
      );
    },
    binary: ({ value }) => {
      const resolved = dataRefs.get(value.value.ref);
      if (!resolved) {
        return <div>Could not find data.</div>;
      }

      const coercedValue = useMemo(() => {
        const binaryValue = dataRefs.get(value.value.ref);
        if (binaryValue!.value instanceof Uint8Array) {
          return binaryValue!.value;
        }
        return new Uint8Array(Object.values((binaryValue as BinaryDataValue).value));
      }, [dataRefs, value.value.ref]);

      return <>Binary (length {coercedValue.length.toLocaleString()})</>;
    },
    audio: ({ value }) => {
      const resolved = dataRefs.get(value.value.ref);
      if (!resolved) {
        return <div>Could not find data.</div>;
      }

      const {
        value: { data, mediaType },
      } = resolved as AudioDataValue;

      const dataUri = useMemo(() => {
        const blob = new Blob([data], { type: mediaType });
        return URL.createObjectURL(blob);
      }, [data, mediaType]);

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
      const resolved = dataRefs.get(value.value.ref);
      if (!resolved) {
        return <div>Could not find data.</div>;
      }

      const {
        value: { context, data, title, enableCitations, mediaType },
      } = resolved as DocumentDataValue;

      return (
        <div>
          <p>
            {title ? `Document: ${title}` : 'Document'} ({mediaType})
          </p>
          {context && <p>{context}</p>}
          {enableCitations && <p>(Citations enabled)</p>}
          Size: {data.length > 0 ? prettyBytes(data.length) : '0 bytes'}
        </div>
      );
    },
  };
  /* eslint-enable react-hooks/rules-of-hooks -- These are components (ish) */

  return scalarRenderers;
}
