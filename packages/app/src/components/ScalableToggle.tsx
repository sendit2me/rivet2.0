import { css } from '@emotion/react';
import clsx from 'clsx';
import { type ChangeEventHandler, type FC } from 'react';

type ScalableToggleProps = {
  id?: string;
  isChecked?: boolean;
  isDisabled?: boolean;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  className?: string;
  size?: 'regular' | 'large';
};

const scalableToggleStyles = css`
  --toggle-scale: var(--ui-font-scale, 1);
  --toggle-width: calc(32px * var(--toggle-scale));
  --toggle-height: calc(16px * var(--toggle-scale));
  --toggle-padding: calc(2px * var(--toggle-scale));
  --toggle-thumb-size: calc(12px * var(--toggle-scale));
  --toggle-icon-size: calc(10px * var(--toggle-scale));

  position: relative;
  width: var(--toggle-width);
  height: var(--toggle-height);
  display: inline-flex;
  align-items: center;
  flex: 0 0 auto;
  cursor: pointer;

  &.is-large {
    --toggle-width: calc(40px * var(--toggle-scale));
    --toggle-height: calc(20px * var(--toggle-scale));
    --toggle-thumb-size: calc(16px * var(--toggle-scale));
    --toggle-icon-size: calc(12px * var(--toggle-scale));
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.6;
  }

  .scalable-toggle-input {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: inherit;
  }

  .scalable-toggle-track {
    position: relative;
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
    border-radius: calc(var(--toggle-height) * 2);
    corner-shape: superellipse(1.15);
    background-color: var(--ds-background-neutral-bold, #a5adba);
    transition: background-color 0.15s ease-out;
  }

  &.is-checked .scalable-toggle-track {
    background-color: var(--primary);
  }

  &:not(.is-disabled):hover:not(.is-checked) .scalable-toggle-track {
    background-color: var(--ds-background-neutral-bold-hovered, #505f79);
  }

  &:not(.is-disabled):hover.is-checked .scalable-toggle-track {
    background-color: var(--primary-light);
  }

  .scalable-toggle-input:focus-visible + .scalable-toggle-track {
    outline: 2px solid var(--primary);
    outline-offset: 2px;
  }

  .scalable-toggle-thumb {
    position: absolute;
    top: var(--toggle-padding);
    left: var(--toggle-padding);
    width: var(--toggle-thumb-size);
    height: var(--toggle-thumb-size);
    border-radius: 999px;
    background-color: var(--ds-icon-inverse, #172b4d);
    transition: transform 0.15s ease-out;
  }

  &.is-checked .scalable-toggle-thumb {
    transform: translateX(calc(var(--toggle-width) - var(--toggle-thumb-size) - (var(--toggle-padding) * 2)));
  }

  .scalable-toggle-icon {
    position: absolute;
    top: 0;
    bottom: 0;
    width: calc(var(--toggle-width) / 2);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--ds-icon-inverse, #172b4d);
    font-size: var(--toggle-icon-size);
    font-weight: 800;
    line-height: 1;
    text-align: center;
    transition: opacity 0.15s ease-out;
    pointer-events: none;
  }

  .scalable-toggle-icon::before {
    display: block;
  }

  .scalable-toggle-icon-check {
    left: 0;
    opacity: 0;
    font-weight: 950;
  }

  .scalable-toggle-icon-check::before {
    content: '\\2714';
  }

  .scalable-toggle-icon-cross {
    right: 0.06em;
    opacity: 1;
    font-family: Arial, sans-serif;
    font-size: calc(var(--toggle-icon-size) * 1.55);
    font-weight: 650;
  }

  .scalable-toggle-icon-cross::before {
    content: '\\00d7';
    transform: translateY(0.035em);
  }

  &.is-checked .scalable-toggle-icon-check {
    opacity: 1;
  }

  &.is-checked .scalable-toggle-icon-cross {
    opacity: 0;
  }
`;

export const ScalableToggle: FC<ScalableToggleProps> = ({
  className,
  id,
  isChecked,
  isDisabled,
  onChange,
  size,
}) => (
  <label
    className={clsx(
      'scalable-toggle',
      isChecked && 'is-checked',
      isDisabled && 'is-disabled',
      size === 'large' && 'is-large',
      className,
    )}
    css={scalableToggleStyles}
  >
    <input
      id={id}
      checked={Boolean(isChecked)}
      className="scalable-toggle-input"
      disabled={isDisabled}
      onChange={onChange}
      readOnly={onChange == null}
      type="checkbox"
    />
    <span className="scalable-toggle-track" aria-hidden="true">
      <span className="scalable-toggle-icon scalable-toggle-icon-check" />
      <span className="scalable-toggle-icon scalable-toggle-icon-cross" />
      <span className="scalable-toggle-thumb" />
    </span>
  </label>
);
