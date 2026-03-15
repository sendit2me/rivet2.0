import { toast } from 'react-toastify';
import { openExternalUrl } from '../utils/nativeApp';

export function useOpenUrl(url: string) {
  return async () => {
    openExternalUrl(url).catch((err) => {
      toast.error(`Failed to open URL: ${err}`);
    });
  };
}
