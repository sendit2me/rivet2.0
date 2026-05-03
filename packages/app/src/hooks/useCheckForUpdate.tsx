import { toast } from 'react-toastify';
import { css } from '@emotion/react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { checkForUpdatesState, skippedMaxVersionState, updateModalOpenState } from '../state/settings';
import { lte } from 'semver';
import { isInTauri } from '../utils/platform/core.js';
import { checkForAppUpdate } from '../utils/platform/updater.js';

const toastStyle = css`
  display: flex;
  flex-direction: column;

  .actions {
    display: flex;
    flex-direction: row;
    justify-content: flex-end;
  }

  button {
    background-color: var(--grey);
    color: var(--grey-lightest);
    font-family: apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', 'Fira Sans',
      'Droid Sans', 'Helvetica Neue', sans-serif;
    border: 1px solid var(--grey-lightest);
    padding: 8px 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    white-space: nowrap;
    font-size: var(--ui-font-size-base);
    cursor: pointer;

    &.primary {
      background-color: var(--primary);
      color: var(--foreground-on-primary);
    }
  }
`;

export function useCheckForUpdate({
  notifyNoUpdates = false,
  force = false,
  notifyErrors,
}: { notifyNoUpdates?: boolean; force?: boolean; notifyErrors?: boolean } = {}) {
  const setUpdateModalOpen = useSetAtom(updateModalOpenState);
  const checkForUpdates = useAtomValue(checkForUpdatesState);
  const [skippedMaxVersion, setSkippedMaxVersion] = useAtom(skippedMaxVersionState);
  const shouldNotifyErrors = notifyErrors ?? (notifyNoUpdates || force);

  return async () => {
    if ((!force && !checkForUpdates) || !isInTauri()) {
      console.log('Skipping update check');
      return;
    }

    let updateResult: Awaited<ReturnType<typeof checkForAppUpdate>>;
    try {
      updateResult = await checkForAppUpdate();
    } catch (error) {
      console.warn('Update check failed', error);
      if (shouldNotifyErrors) {
        throw error;
      }
      return;
    }

    const { shouldUpdate, manifest } = updateResult;

    if (!manifest) {
      console.log('No manifest found');
      return;
    }

    const shouldSkip = skippedMaxVersion == null ? false : lte(manifest.version, skippedMaxVersion);

    if (force) {
      setSkippedMaxVersion(undefined);
    }

    if (shouldUpdate && (force || !shouldSkip)) {
      toast.success(
        ({ closeToast }) => (
          <div css={toastStyle}>
            <div className="info">Rivet version {manifest?.version} is now available!</div>
            <div className="actions">
              <button className="primary" onClick={() => setUpdateModalOpen(true)}>
                Install
              </button>
              <button onClick={() => setSkippedMaxVersion(manifest?.version)}>Skip</button>
              <button onClick={() => closeToast?.()}>Not Now</button>
            </div>
          </div>
        ),
        {
          autoClose: false,
          closeButton: false,
        },
      );
    } else if (notifyNoUpdates) {
      toast.info('Rivet is up to date!');
    }
  };
}
