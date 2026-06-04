import { css } from '@emotion/react';
import {
  compareNodeComparisonFunctionOptions,
  type CompareNode,
  type CompareNodeData,
} from '@valerypopoff/rivet2-core';
import type { ChangeEvent, FC, MouseEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { useEditNodeCommand } from '../../commands/editNodeCommand.js';
import type { NodeComponentDescriptor } from '../../hooks/useNodeTypes.js';

const defaultComparisonFunction: CompareNodeData['comparisonFunction'] = '==';

const styles = css`
  align-items: center;
  color: var(--foreground-bright);
  display: inline-flex;
  font-family: var(--font-family-monospace);
  font-size: var(--ui-font-size-sm);
  gap: calc(7px * var(--ui-font-scale, 1));
  line-height: 1.2;
  max-width: 100%;
  min-width: 0;
  user-select: none;

  .compare-node-body-operand {
    font-weight: 700;
  }

  .compare-node-body-input {
    color: var(--foreground-dim);
    font-weight: 700;
  }

  .compare-node-body-select-wrap {
    align-items: center;
    color: var(--foreground-bright);
    display: inline-flex;
    position: relative;
  }

  .compare-node-body-select-wrap::after {
    border-left: calc(4px * var(--ui-font-scale, 1)) solid transparent;
    border-right: calc(4px * var(--ui-font-scale, 1)) solid transparent;
    border-top: calc(5px * var(--ui-font-scale, 1)) solid currentColor;
    content: '';
    pointer-events: none;
    position: absolute;
    right: calc(7px * var(--ui-font-scale, 1));
  }

  .compare-node-body-select {
    appearance: none;
    background: color-mix(in srgb, var(--grey-darkish) 80%, transparent);
    border: 1px solid color-mix(in srgb, var(--foreground-bright) 18%, transparent);
    border-radius: calc(5px * var(--ui-font-scale, 1));
    color: var(--foreground-bright);
    cursor: pointer;
    font: inherit;
    font-weight: 700;
    height: calc(24px * var(--ui-font-scale, 1));
    line-height: 1;
    min-width: calc(58px * var(--ui-font-scale, 1));
    padding: 0 calc(20px * var(--ui-font-scale, 1)) 0 calc(8px * var(--ui-font-scale, 1));
  }

  .compare-node-body-select:focus-visible {
    border-color: var(--primary);
    outline: none;
  }

  .compare-node-body-select option {
    background: var(--grey-dark);
    color: var(--foreground-bright);
  }
`;

function isComparisonFunction(value: string): value is CompareNodeData['comparisonFunction'] {
  return compareNodeComparisonFunctionOptions.some((option) => option.value === value);
}

const CompareNodeBody: FC<{ node: CompareNode }> = ({ node }) => {
  const editNode = useEditNodeCommand();
  const rootRef = useRef<HTMLDivElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const [isSelectFocused, setIsSelectFocused] = useState(false);

  useEffect(() => {
    if (!isSelectFocused) {
      return;
    }

    const handleDocumentPointerDown = (event: PointerEvent) => {
      const selectElement = selectRef.current;

      if (!selectElement || document.activeElement !== selectElement || !(event.target instanceof Node)) {
        return;
      }

      const nodeElement = rootRef.current?.closest<HTMLElement>('.node');

      if (nodeElement?.contains(event.target)) {
        return;
      }

      selectElement.blur();
    };

    document.addEventListener('pointerdown', handleDocumentPointerDown, true);

    return () => {
      document.removeEventListener('pointerdown', handleDocumentPointerDown, true);
    };
  }, [isSelectFocused]);

  const handleDoubleClick = (event: MouseEvent<HTMLDivElement>) => {
    event.stopPropagation();
  };

  if (node.data.useComparisonFunctionInput) {
    return (
      <div ref={rootRef} css={styles} onDoubleClick={handleDoubleClick}>
        <span className="compare-node-body-operand">A</span>
        <span className="compare-node-body-input">(input)</span>
        <span className="compare-node-body-operand">B</span>
      </div>
    );
  }

  const comparisonFunction = isComparisonFunction(node.data.comparisonFunction)
    ? node.data.comparisonFunction
    : defaultComparisonFunction;

  const handleChange = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextComparisonFunction = event.target.value;

    if (!isComparisonFunction(nextComparisonFunction)) {
      return;
    }

    editNode({
      nodeId: node.id,
      newNode: {
        data: {
          ...node.data,
          comparisonFunction: nextComparisonFunction,
        },
      },
    });
  };

  return (
    <div ref={rootRef} css={styles} onDoubleClick={handleDoubleClick}>
      <span className="compare-node-body-operand">A</span>
      <span className="compare-node-body-select-wrap">
        <select
          ref={selectRef}
          aria-label="Comparison function"
          className="compare-node-body-select"
          onBlur={() => setIsSelectFocused(false)}
          onChange={handleChange}
          onFocus={() => setIsSelectFocused(true)}
          value={comparisonFunction}
        >
          {compareNodeComparisonFunctionOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </span>
      <span className="compare-node-body-operand">B</span>
    </div>
  );
};

export const compareNodeDescriptor: NodeComponentDescriptor<'compare'> = {
  Body: CompareNodeBody,
};
