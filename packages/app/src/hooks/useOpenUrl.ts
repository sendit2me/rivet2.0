import { openExternalUrl } from '../utils/platform/shell.js';
import { wrapAsync } from '../utils/errorHandling.js';

export function useOpenUrl(url: string) {
  return wrapAsync(
    async (event?: { preventDefault?: () => void }) => {
      event?.preventDefault?.();
      await openExternalUrl(url);
    },
    'Failed to open URL',
    {
      metadata: {
        url,
      },
    },
  );
}
