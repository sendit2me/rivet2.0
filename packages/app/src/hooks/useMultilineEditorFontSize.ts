import { useAtom } from 'jotai';
import { useCallback, useEffect } from 'react';
import { multilineEditorFontSizeState } from '../state/ui.js';
import {
  adjustMultilineEditorFontSize,
  clampMultilineEditorFontSize,
  getMultilineEditorFontSizeCommand,
  getMultilineEditorFontSizeWheelCommand,
  type MultilineEditorFontSizeKeyEvent,
  type MultilineEditorFontSizeWheelEvent,
} from '../utils/multilineEditorFontSize.js';

type HandledMultilineEditorFontSizeKeyEvent = MultilineEditorFontSizeKeyEvent & {
  preventDefault(): void;
  stopPropagation(): void;
};

type HandledMultilineEditorFontSizeWheelEvent = MultilineEditorFontSizeWheelEvent & {
  preventDefault(): void;
  stopPropagation(): void;
};

export const useMultilineEditorFontSize = () => {
  const [storedFontSize, setStoredFontSize] = useAtom(multilineEditorFontSizeState);
  const normalizedFontSize = clampMultilineEditorFontSize(storedFontSize);

  useEffect(() => {
    if (storedFontSize !== normalizedFontSize) {
      setStoredFontSize(normalizedFontSize);
    }
  }, [normalizedFontSize, setStoredFontSize, storedFontSize]);

  const setNormalizedFontSize = useCallback(
    (nextFontSize: number | ((currentFontSize: number) => number)) => {
      setStoredFontSize((currentFontSize) => {
        const normalizedCurrentFontSize = clampMultilineEditorFontSize(currentFontSize);
        const resolvedNextFontSize =
          typeof nextFontSize === 'function' ? nextFontSize(normalizedCurrentFontSize) : nextFontSize;

        return clampMultilineEditorFontSize(resolvedNextFontSize);
      });
    },
    [setStoredFontSize],
  );

  const handleKeyDown = useCallback(
    (event: HandledMultilineEditorFontSizeKeyEvent): boolean => {
      const command = getMultilineEditorFontSizeCommand(event);

      if (!command) {
        return false;
      }

      event.preventDefault();
      event.stopPropagation();

      setNormalizedFontSize((currentFontSize) => adjustMultilineEditorFontSize(currentFontSize, command));
      return true;
    },
    [setNormalizedFontSize],
  );

  const handleWheel = useCallback(
    (event: HandledMultilineEditorFontSizeWheelEvent): boolean => {
      const command = getMultilineEditorFontSizeWheelCommand(event);

      if (!command) {
        return false;
      }

      event.preventDefault();
      event.stopPropagation();

      setNormalizedFontSize((currentFontSize) => adjustMultilineEditorFontSize(currentFontSize, command));
      return true;
    },
    [setNormalizedFontSize],
  );

  return {
    fontSize: normalizedFontSize,
    handleKeyDown,
    handleWheel,
  };
};
