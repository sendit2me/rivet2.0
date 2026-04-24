export type OutputRenderMode = 'compact' | 'expanded-preview' | 'full';

export function shouldShowLargeStoredValueActions(options: {
  mode: OutputRenderMode;
  allowLargeStoredValueActions?: boolean;
}): boolean {
  return (
    options.mode === 'full' || (options.mode === 'expanded-preview' && options.allowLargeStoredValueActions === true)
  );
}
