import { css } from '@emotion/react';
import { Label } from '@atlaskit/form';
import clsx from 'clsx';
import { type FC, type ReactNode } from 'react';
import { ScalableToggle } from './ScalableToggle.js';

const labeledToggleStyles = css`
  display: inline-flex;
  align-items: center;

  .labeled-toggle-control {
    display: inline-flex;
    align-items: center;
    gap: 8px;
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
    background-color: var(--ds-background-success-bold-hovered, #7ee2b8);
  }

  .labeled-toggle-label label {
    margin: 0;
  }
`;

export const LabeledToggle: FC<{
  id: string;
  isChecked: boolean | undefined;
  label: ReactNode;
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
  onChange,
  className,
  labelClassName,
  size,
  switchClassName,
}) => (
  <div className={clsx('labeled-toggle-field', className, isDisabled && 'is-disabled')} css={labeledToggleStyles}>
    <div className="labeled-toggle-control">
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
      </div>
    </div>
  </div>
);
