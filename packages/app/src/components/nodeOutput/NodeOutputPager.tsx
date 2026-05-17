import type { FC, MouseEvent } from 'react';

export type NodeOutputPagerProps = {
  selectedPage: number | 'latest';
  totalPages: number;
  onPrevPage: () => void;
  onNextPage: () => void;
  stopDoubleClickPropagation?: boolean;
};

export const NodeOutputPager: FC<NodeOutputPagerProps> = ({
  onNextPage,
  onPrevPage,
  selectedPage,
  stopDoubleClickPropagation = false,
  totalPages,
}) => {
  const handleDoubleClick = stopDoubleClickPropagation ? (event: MouseEvent) => event.stopPropagation() : undefined;

  return (
    <div className="picker">
      <button className="picker-left" onClick={onPrevPage} onDoubleClick={handleDoubleClick}>
        {'<'}
      </button>
      <div className="picker-page">{selectedPage === 'latest' ? totalPages : selectedPage + 1}</div>
      <button className="picker-right" onClick={onNextPage} onDoubleClick={handleDoubleClick}>
        {'>'}
      </button>
    </div>
  );
};
