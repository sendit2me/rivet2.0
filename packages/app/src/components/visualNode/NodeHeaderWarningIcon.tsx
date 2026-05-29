import type { FC, SVGProps } from 'react';

export const NodeHeaderWarningIcon: FC<SVGProps<SVGSVGElement>> = (props) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
    <path
      d="M10.35 4.05 2.85 17.25A2 2 0 0 0 4.6 20.25h14.8a2 2 0 0 0 1.75-3L13.65 4.05a1.9 1.9 0 0 0-3.3 0Z"
      stroke="currentColor"
      strokeWidth="2.15"
      strokeLinejoin="round"
    />
    <path d="M12 8.75v5.1" stroke="currentColor" strokeWidth="2.15" strokeLinecap="round" />
    <path d="M12 17.15h.01" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" />
  </svg>
);
