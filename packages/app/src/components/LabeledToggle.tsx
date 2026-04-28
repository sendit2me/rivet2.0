import { css } from '@emotion/react';
import { Label } from '@atlaskit/form';
import clsx from 'clsx';
import { type FC, type ReactNode } from 'react';
import { ScalableToggle } from './ScalableToggle.js';
import { FieldHelperMessage } from './FieldHelperMessage.js';

const labeledToggleStyles = css`
  display: inline-flex;
  align-items: center;

  .labeled-toggle-control {
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .labeled-toggle-control.has-helper-message {
    align-items: flex-start;
  }

  .labeled-toggle-control.has-helper-message .labeled-toggle-switch {
    margin-top: 2px;
  }

  &:not(.is-disabled) .labeled-toggle-control,
  &:not(.is-disabled) .labeled-toggle-label label {
    cursor: pointer;
  }

  &.is-disabled .labeled-toggle-control,
  &.is-disabled .labeled-toggle-label label {
    cursor: not-allowed;
  }

  &:not(.is-disabled) .labeled-toggle-control:hover .labeled-toggle-switch:not(.is-checked) .scalable-toggle-track {
    background-color: var(--ds-background-neutral-bold-hovered, #505f79);
  }

  &:not(.is-disabled) .labeled-toggle-control:hover .labeled-toggle-switch.is-checked .scalable-toggle-track {
    background-color: var(--primary-light);
  }

  .labeled-toggle-label label {
    margin: 0;
  }

  .labeled-toggle-helper-label {
    display: block;
    margin: 0;
  }

  .labeled-toggle-helper {
    margin-bottom: 0;
  }
`;

export const LabeledToggle: FC<{
  id: string;
  isChecked: boolean | undefined;
  label: ReactNode;
  helperMessage?: ReactNode;
  onChange: (value: boolean) => void;
  className?: string;
  isDisabled?: boolean;
  labelClassName?: string;
  size?: 'regular' | 'large';
  switchClassName?: string;
}> = ({
  id,
  isChecked,
  isDisabled = false,
  label,
  helperMessage,
  onChange,
  className,
  labelClassName,
  size,
  switchClassName,
}) => (
  <div className={clsx('labeled-toggle-field', className, isDisabled && 'is-disabled')} css={labeledToggleStyles}>
    <div className={clsx('labeled-toggle-control', helperMessage && 'has-helper-message')}>
      <ScalableToggle
        id={id}
        isChecked={isChecked}
        isDisabled={isDisabled}
        onChange={(event) => onChange(event.target.checked)}
        size={size}
        className={clsx('labeled-toggle-switch', switchClassName)}
      />
      <div className={clsx('labeled-toggle-label', labelClassName)}>
        <Label htmlFor={id}>{label}</Label>
        {helperMessage && (
          <label className="labeled-toggle-helper-label" htmlFor={id}>
            <FieldHelperMessage className="labeled-toggle-helper">{helperMessage}</FieldHelperMessage>
          </label>
        )}
      </div>
    </div>
  </div>
);
