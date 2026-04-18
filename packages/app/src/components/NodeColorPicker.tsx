import { type FC } from 'react';

import Popup from '@atlaskit/popup';
import { useToggle } from 'ahooks';
import { css } from '@emotion/react';

const buttonStyles = css`
  background-color: transparent;
  border: none;
  padding: 0;
  margin: 0;
  cursor: pointer;

  > div {
    position: relative;
    width: 32px;
    height: 32px;
    border-radius: 2px;
    border: 1px solid var(--grey);
    overflow: hidden;

    &:hover {
      border-color: var(--grey-light);
    }
  }

  .color-icon-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.94);
    pointer-events: none;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);

    svg {
      width: 18px;
      height: 18px;
      display: block;
    }
  }
`;

const popupStyles = css`
  display: grid;
  grid-template-columns: auto auto;
  gap: 4px;
  padding: 16px;

  button {
    background-color: transparent;
    border: none;
    padding: 0;
    margin: 0;
    cursor: pointer;

    > div {
      width: 32px;
      height: 32px;
      border-radius: 2px;
      border: 1px solid var(--grey);
      position: relative;

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

const colors = [
  'var(--node-color-1)',
  'var(--node-color-2)',
  'var(--node-color-3)',
  'var(--node-color-4)',
  'var(--node-color-5)',
  'var(--node-color-6)',
  'var(--node-color-7)',
  'var(--node-color-8)',
];

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
  currentColor: { bg: string; border: string } | undefined;
  onChange: (newColor: { bg: string; border: string } | undefined) => void;
}> = ({ currentColor = { bg: 'var(--grey-darkish)', border: 'var(--grey-darkish)' }, onChange }) => {
  const [isOpen, toggleIsOpen] = useToggle();

  return (
    <Popup
      content={() => (
        <div css={popupStyles}>
          <button
            onClick={() => {
              onChange(undefined);
              toggleIsOpen.toggle();
            }}
          >
            <div />
          </button>
          <div />
          {colors.map((color) => (
            <>
              <button
                key={`${color}-border`}
                onClick={() => {
                  onChange({ bg: 'var(--grey-darkish)', border: color });
                  toggleIsOpen.toggle();
                }}
              >
                <div
                  style={{
                    borderColor: color,
                  }}
                />
              </button>
              <button
                key={`${color}-bg`}
                onClick={() => {
                  onChange({ bg: color, border: color });
                  toggleIsOpen.toggle();
                }}
              >
                <div
                  style={{
                    borderColor: color,
                    backgroundColor: color,
                  }}
                />
              </button>
            </>
          ))}
        </div>
      )}
      isOpen={isOpen}
      placement="bottom-start"
      trigger={(triggerProps) => (
        <button css={buttonStyles} {...triggerProps} onClick={toggleIsOpen.toggle}>
          <div
            style={{
              backgroundColor: currentColor.bg,
              borderColor: currentColor.border,
            }}
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
