import { type FC } from 'react';

type SplitRunModeIconProps = {
  isSequential?: boolean;
};

const SplitArrow = () => (
  <>
    <path d="M0 0H6.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <path
      d="M4.2 -2.2L7.8 0L4.2 2.2"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </>
);

const ParallelSplitIcon = () => (
  <svg className="split-run-mode-icon" viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden="true">
    <g transform="translate(4.1 4.5)">
      <SplitArrow />
    </g>
    <g transform="translate(4.1 11.5)">
      <SplitArrow />
    </g>
  </svg>
);

const SequentialSplitIcon = () => (
  <svg
    className="split-run-mode-icon split-run-mode-icon-sequential"
    viewBox="0 0 20 16"
    width="20"
    height="16"
    fill="none"
    aria-hidden="true"
  >
    <g transform="translate(0.8 8)">
      <SplitArrow />
    </g>
    <g transform="translate(10.6 8)">
      <SplitArrow />
    </g>
  </svg>
);

export const SplitRunModeIcon: FC<SplitRunModeIconProps> = ({ isSequential }) =>
  isSequential ? <SequentialSplitIcon /> : <ParallelSplitIcon />;
