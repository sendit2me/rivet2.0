import { useSetAtom } from 'jotai';
import { updateStatusState } from '../state/settings';
import useAsyncEffect from 'use-async-effect';
import { isInTauri, onAppUpdaterEvent } from '../utils/nativeApp';

export function useMonitorUpdateStatus() {
  const setUpdateStatus = useSetAtom(updateStatusState);

  useAsyncEffect(async () => {
    let unlisten: any | undefined = undefined;

    if (isInTauri()) {
      unlisten = await onAppUpdaterEvent(({ error, status }) => {
        switch (status) {
          case 'PENDING':
            setUpdateStatus('Downloading...');
            break;
          case 'DONE':
            setUpdateStatus('Installed.');
            break;
          case 'ERROR':
            setUpdateStatus(`Error - ${error}`);
            break;
          case 'UPTODATE':
            setUpdateStatus('Up to date.');
            break;
          case 'DOWNLOADED':
            setUpdateStatus('Installing...');
            break;
          default:
            break;
        }
      });
    }

    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, []);
}
