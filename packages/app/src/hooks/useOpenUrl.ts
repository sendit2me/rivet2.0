import { toast } from 'react-toastify';
import { openExternalUrl } from '../utils/platform/shell.js';

export function useOpenUrl(url: string) {
  return async () => {
    openExternalUrl(url).catch((err) => {
      toast.error(`Failed to open URL: ${err}`);
    });
  };
}
