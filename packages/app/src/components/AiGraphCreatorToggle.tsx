import { css } from '@emotion/react';
import { type CSSProperties, type FC } from 'react';
import SparklesIcon from '../assets/icons/ai-sparks-solid.svg?react';
import { showAiGraphCreatorInputState } from './AiGraphCreatorInput';
import { useAtomValue, useSetAtom } from 'jotai';
import { sidebarOpenState } from '../state/graphBuilder';
import clsx from 'clsx';
import { leftSidebarLiveWidthState } from '../state/ui';
import { getLeftSidebarAttachedControlOffset } from '../utils/leftSidebarWidth';

const styles = css`
  position: absolute;
  left: 16px;
  bottom: 16px;

  &.sidebar-open {
    left: var(--ai-graph-creator-left);
  }

  button {
    width: 48px;
    height: 48px;
    background: var(--grey-darker);
    border-radius: 32px;
    corner-shape: superellipse(1.15);
    border: 1px solid var(--grey-dark);
    z-index: 50;
    /* box-shadow: 3px 1px 10px rgba(0, 0, 0, 0.5); */
    cursor: pointer;
    color: var(--primary);

    svg {
      width: 24px;
      height: 24px;
    }

    &:hover {
      background: var(--grey-lightish);
      color: var(--grey-lightest);
    }
  }
`;

export const AiGraphCreatorToggle: FC = () => {
  const setShowAiGraphCreatorInput = useSetAtom(showAiGraphCreatorInputState);
  const isSidebarOpen = useAtomValue(sidebarOpenState);
  const aiGraphCreatorLeft = getLeftSidebarAttachedControlOffset(useAtomValue(leftSidebarLiveWidthState));

  const handleClick = () => {
    setShowAiGraphCreatorInput((prev) => !prev);
  };

  return (
    <div
      css={styles}
      className={clsx({ 'sidebar-open': isSidebarOpen })}
      style={{ '--ai-graph-creator-left': `${aiGraphCreatorLeft}px` } as CSSProperties}
    >
      <button onClick={handleClick}>
        <SparklesIcon />
      </button>
    </div>
  );
};
