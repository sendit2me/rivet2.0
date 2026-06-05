import { Fragment, type CSSProperties, type FC } from 'react';

import Popup from '@atlaskit/popup';
import { useToggle } from 'ahooks';
import { css } from '@emotion/react';
import { PopupMenuContainer, popupMenuSurfaceStyles } from './PopupMenu.js';
import {
  DEFAULT_NODE_HEADER_COLOR,
  createBorderAndHeaderNodeColor,
  createHeaderOnlyNodeColor,
  getNodeBorderReferenceColor,
  getNodeHeaderColor,
  isNodeBorderVisible,
  PROJECT_DEFAULT_NODE_HEADER_COLOR,
  type NodeColor,
} from '../utils/nodeColor.js';

const buttonStyles = css`
  display: block;
  background-color: transparent;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;

  > .node-color-picker-swatch {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    @supports not (corner-shape: squircle) {
      border-radius: 4px;
    }

    &:hover {
      border-color: var(--grey-light);
    }
  }

  .color-icon-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    color: var(--node-color-picker-trigger-icon);
    pointer-events: none;

    svg {
      width: 22px;
      height: 22px;
      display: block;
      position: absolute;
      right: 4px;
      bottom: 4px;
    }
  }
`;

const popupStyles = css`
  ${popupMenuSurfaceStyles};
  display: grid;
  grid-template-columns: repeat(2, auto);
  gap: 4px;
  padding: 16px;

  button {
    background-color: transparent;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;

    > .node-color-picker-option {
      width: 32px;
      height: 32px;
      border-radius: 4px;
      @supports not (corner-shape: squircle) {
        border-radius: 2px;
      }

      &::after {
        content: '';
        display: block;
        position: absolute;
        top: 0;
        right: 0;
        bottom: 0;
        left: 0;
        z-index: 2;
        transition: background-color 0.2s ease-out;
      }

      &:hover {
        border-color: var(--grey-light);

        &::after {
          background-color: rgba(255, 255, 255, 0.2);
        }
      }
    }
  }
`;

const nodeSwatchStyles = css`
  box-sizing: border-box;
  position: relative;
  overflow: hidden;
  corner-shape: squircle;
  background-color: var(--node-color-picker-swatch-body-bg);
  border: var(--node-color-picker-border-width) solid var(--node-color-picker-border);

  &::before {
    content: '';
    display: block;
    position: absolute;
    inset: 0 0 auto 0;
    height: 45%;
    background-color: var(--node-color-picker-header);
    border-bottom: 1px solid rgba(0, 0, 0, 0.2);
  }
`;

const colors: Array<{ color: string; label: string; isDefault?: boolean }> = [
  { color: DEFAULT_NODE_HEADER_COLOR, label: 'Default', isDefault: true },
  { color: 'var(--node-color-1)', label: 'Orange' },
  { color: 'var(--node-color-2)', label: 'Purple' },
  { color: 'var(--node-color-3)', label: 'Teal' },
  { color: 'var(--node-color-4)', label: 'Green' },
  { color: 'var(--node-color-5)', label: 'Red' },
  { color: 'var(--node-color-6)', label: 'Yellow' },
  { color: 'var(--node-color-7)', label: 'Coral' },
  { color: 'var(--node-color-8)', label: 'Black' },
];

function getSwatchStyle(headerColor: string, borderColor: string, hasBorder: boolean) {
  return {
    '--node-color-picker-header': headerColor,
    '--node-color-picker-border': borderColor,
    '--node-color-picker-border-width': hasBorder ? '2px' : '0px',
  } as CSSProperties;
}

const PaletteBadgeIcon = () => (
  <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
    <path
      d="M8 2.5C4.41015 2.5 1.5 4.79822 1.5 7.63333C1.5 10.2056 3.88862 12.3 6.83333 12.3H7.35556C7.93462 12.3 8.36111 12.7006 8.36111 13.1667C8.36111 13.9131 9.03736 14.5 9.86111 14.5H10.5C12.7091 14.5 14.5 12.7091 14.5 10.5V8.8C14.5 5.30721 11.477 2.5 8 2.5Z"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <circle cx="4.9" cy="7.1" r="0.9" fill="currentColor" />
    <circle cx="7.3" cy="5.6" r="0.9" fill="currentColor" />
    <circle cx="10" cy="5.8" r="0.9" fill="currentColor" />
  </svg>
);

export const NodeColorPicker: FC<{
  currentColor: NodeColor | undefined;
  onChange: (newColor: NodeColor | undefined) => void;
}> = ({ currentColor, onChange }) => {
  const [isOpen, toggleIsOpen] = useToggle();
  const currentHeaderColor = getNodeHeaderColor(currentColor);
  const currentHasBorder = isNodeBorderVisible(currentColor);
  const currentBorderColor = currentHasBorder ? getNodeBorderReferenceColor(currentColor) : 'transparent';
  const currentSwatchStyle = getSwatchStyle(currentHeaderColor, currentBorderColor, currentHasBorder);

  const getHeaderOnlyColor = (color: (typeof colors)[number]) =>
    color.isDefault ? undefined : createHeaderOnlyNodeColor(color.color);
  const getBorderAndHeaderColor = (color: (typeof colors)[number]) =>
    createBorderAndHeaderNodeColor(color.isDefault ? PROJECT_DEFAULT_NODE_HEADER_COLOR : color.color);

  return (
    <Popup
      popupComponent={PopupMenuContainer}
      content={() => (
        <div css={popupStyles}>
          {colors.map((color) => (
            <Fragment key={color.color}>
              <button
                type="button"
                aria-label={`${color.label} header`}
                onClick={() => {
                  onChange(getHeaderOnlyColor(color));
                  toggleIsOpen.toggle();
                }}
              >
                <div
                  className="node-color-picker-option"
                  css={nodeSwatchStyles}
                  style={getSwatchStyle(color.color, 'transparent', false)}
                />
              </button>
              <button
                type="button"
                aria-label={`${color.label} border and header`}
                onClick={() => {
                  onChange(getBorderAndHeaderColor(color));
                  toggleIsOpen.toggle();
                }}
              >
                <div
                  className="node-color-picker-option"
                  css={nodeSwatchStyles}
                  style={getSwatchStyle(color.color, color.color, true)}
                />
              </button>
            </Fragment>
          ))}
        </div>
      )}
      isOpen={isOpen}
      placement="bottom-start"
      trigger={(triggerProps) => (
        <button
          type="button"
          className="node-color-picker-trigger"
          css={buttonStyles}
          {...triggerProps}
          onClick={toggleIsOpen.toggle}
          aria-label="Choose node color"
        >
          <div
            className="node-color-picker-swatch"
            css={nodeSwatchStyles}
            style={currentSwatchStyle}
          >
            <span className="color-icon-overlay">
              <PaletteBadgeIcon />
            </span>
          </div>
        </button>
      )}
    />
  );
};
