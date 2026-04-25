import { type ChartNode } from '@ironclad/rivet-core';
import { type FC, type MouseEvent, type PointerEvent } from 'react';
import { Tooltip } from '../Tooltip.js';
import { useCanvasHandlersContext } from '../CanvasContext.js';
import { SplitRunModeIcon } from './SplitRunModeIcon.js';

export const SplitRunSummary: FC<{
  node: ChartNode;
  isKnownNodeType: boolean;
}> = ({ node, isKnownNodeType }) => {
  const { onNodeStartEditing } = useCanvasHandlersContext();

  if (!node.isSplitRun) {
    return null;
  }

  const splitRunModeLabel = node.isSplitSequential ? 'sequential' : 'parallel';
  const splitRunMaxLabel = `max ${node.splitRunMax ?? 10}`;

  return (
    <Tooltip className="split-run-summary-tooltip" content="Edit Node" placement="top" tag="span">
      <button
        type="button"
        className="split-run-summary"
        aria-label={`Edit split run settings, ${splitRunModeLabel}, ${splitRunMaxLabel}`}
        onClick={(event: MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          if (isKnownNodeType) {
            onNodeStartEditing?.(node);
          }
        }}
        onMouseDown={(event: MouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          event.preventDefault();
        }}
        onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
          event.stopPropagation();
        }}
      >
        <SplitRunModeIcon isSequential={node.isSplitSequential} />
        <span className="split-run-summary-text">
          <strong className="split-run-summary-mode">{splitRunModeLabel}</strong>
          {`, ${splitRunMaxLabel}`}
        </span>
      </button>
    </Tooltip>
  );
};
