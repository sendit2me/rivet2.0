import { css } from '@emotion/react';
import { Label } from '@atlaskit/form';
import Toggle from '@atlaskit/toggle';
import clsx from 'clsx';
import { type FC, type ReactNode } from 'react';

const labeledToggleStyles = css`
  display: inline-flex;
  align-items: center;

  .labeled-toggle-control {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  &:not(.is-disabled) .labeled-toggle-control,
  &:not(.is-disabled) .labeled-toggle-label label {
    cursor: pointer;
  }

  &.is-disabled .labeled-toggle-control,
  &.is-disabled .labeled-toggle-label label {
    cursor: not-allowed;
  }

  .labeled-toggle-switch,
  .labeled-toggle-switch > * {
    margin-left: 0 !important;
  }

  .labeled-toggle-switch > label[data-size] {
    margin: 0 0 0 -4px !important;
  }

  .labeled-toggle-switch > label[data-size]:has(input:focus:not(:focus-visible)) {
    border-color: transparent !important;
    outline: none !important;
    box-shadow: none !important;
  }

  &:not(.is-disabled)
    .labeled-toggle-control:hover
    .labeled-toggle-switch
    > label[data-size]:not([data-disabled]):not([data-checked]) {
    background-color: var(--ds-background-neutral-bold-hovered, #505f79);
    cursor: pointer;
  }

  &:not(.is-disabled)
    .labeled-toggle-control:hover
    .labeled-toggle-switch
    > label[data-size][data-checked]:not([data-disabled]) {
    background-color: var(--ds-background-success-bold-hovered, #7ee2b8);
    cursor: pointer;
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
      <div className={clsx('labeled-toggle-switch', switchClassName)}>
        <Toggle
          id={id}
          isChecked={isChecked}
          isDisabled={isDisabled}
          onChange={(event) => onChange(event.target.checked)}
          size={size}
        />
      </div>
      <div className={clsx('labeled-toggle-label', labelClassName)}>
        <Label htmlFor={id}>{label}</Label>
      </div>
    </div>
  </div>
);
