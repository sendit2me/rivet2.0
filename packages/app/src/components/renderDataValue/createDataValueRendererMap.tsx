import { type FC, type ReactElement } from 'react';
import {
  arrayizeDataValue,
  dataTypes,
  getScalarTypeOf,
  isArrayDataType,
  isFunctionDataType,
  type DataType,
  type ScalarDataType,
  type ScalarOrArrayDataValue,
} from '@ironclad/rivet-core';
import clsx from 'clsx';
import { type DataValueWithRefs, type ScalarDataValueWithRefs } from '../../state/dataFlow.js';
import { multiOutputStyles, renderDataValueStyles } from './renderDataValueStyles.js';
import { type createScalarRenderers, type ScalarRendererProps } from './createScalarRenderers.js';

export type DataValueRendererProps = {
  value: DataValueWithRefs | undefined;
  depth?: number;
  renderMarkdown?: boolean;
  truncateLength?: number;
  isCompact?: boolean;
};

export function createDataValueRendererMap(options: {
  renderValue: (props: DataValueRendererProps) => ReactElement;
  scalarRenderers: ReturnType<typeof createScalarRenderers>;
}) {
  const { renderValue, scalarRenderers } = options;

  const rendererMap = Object.fromEntries(
    dataTypes.map((dataType) => {
      const Renderer: FC<DataValueRendererProps> = ({ value, depth, renderMarkdown, truncateLength, isCompact }) => {
        if (!value) {
          return <>undefined</>;
        }

        if (isArrayDataType(dataType)) {
          let items = arrayizeDataValue(value as ScalarOrArrayDataValue);
          const count = items.length;

          if (isCompact) {
            items = items.slice(0, 1);
          }

          return (
            <div
              css={multiOutputStyles}
              className={clsx({
                'chat-message-list': value.type === 'chat-message[]',
              })}
            >
              <div className="array-info">
                ({count.toLocaleString()} element{count === 1 ? '' : 's'})
              </div>
              {items.map((item, index) => (
                <div className="multi-output-item" key={index}>
                  {renderValue({
                    value: item as DataValueWithRefs,
                    depth: (depth ?? 0) + 1,
                    renderMarkdown,
                    truncateLength,
                    isCompact,
                  })}
                </div>
              ))}
            </div>
          );
        }

        if (isFunctionDataType(dataType)) {
          const type = getScalarTypeOf(value.type);
          return (
            <div>
              <em>Function{`<${type}>`}</em>
            </div>
          );
        }

        const ScalarRenderer = scalarRenderers[dataType as ScalarDataType] as FC<ScalarRendererProps<ScalarDataType>>;

        if (!ScalarRenderer) {
          return <div>ERROR: UNKNOWN TYPE: {JSON.stringify(value)}</div>;
        }

        return (
          <div css={renderDataValueStyles}>
            <ScalarRenderer
              value={value as ScalarDataValueWithRefs}
              depth={(depth ?? 0) + 1}
              renderMarkdown={renderMarkdown}
              truncateLength={truncateLength}
              isCompact={isCompact}
            />
          </div>
        );
      };

      return [dataType, Renderer];
    }),
  ) as Record<DataType, FC<DataValueRendererProps>>;

  return rendererMap;
}
