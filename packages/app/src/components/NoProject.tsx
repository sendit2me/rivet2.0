import Button from '@atlaskit/button';
import { css } from '@emotion/react';
import { type FC, type MouseEvent } from 'react';
import { useOpenUrl } from '../hooks/useOpenUrl';
import RivetIcon from '../rivet-logo-1024-full.png';
import { useSetAtom } from 'jotai';
import { newProjectModalOpenState } from '../state/ui';
import { settingsModalOpenState } from './SettingsModal';
import { useLoadProjectWithFileBrowser } from '../hooks/useLoadProjectWithFileBrowser';
import { wrapAsync } from '../utils/errorHandling';

const styles = css`
  background: var(--grey-darker);
  width: 100vw;
  height: 100vh;
  box-sizing: border-box;
  padding-top: var(--project-selector-height);
  display: flex;
  align-items: center;
  justify-content: center;

  .inner {
    position: relative;
    background: var(--grey-dark);
    color: var(--grey-light);
    width: 75vh;
    height: 50vh;
    padding: 50px;
    min-width: 600px;
    min-height: 400px;
    box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  h1 {
    margin: 0;
  }

  .inner > ul {
    list-style: none;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 20px;

    > li {
      border-left: 4px solid var(--grey-light);
      padding-left: 8px;

      p {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }

      a {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
    }
  }

  .logo {
    position: absolute;
    right: 50px;
    top: 50px;
    width: 100px;
  }
`;

export const NoProject: FC = () => {
  const openDocumentation = useOpenUrl('https://valerypopoff.github.io/rivet2.0/');
  const setNewProjectModalOpen = useSetAtom(newProjectModalOpenState);
  const setSettingsModalOpen = useSetAtom(settingsModalOpenState);
  const openProject = useLoadProjectWithFileBrowser();

  const openSettings = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    setSettingsModalOpen(true);
  };

  return (
    <div css={styles}>
      <div className="inner">
        <img src={RivetIcon} alt="Rivet Logo" className="logo" />
        <h1>Welcome to Rivet 2</h1>
        <p>No project is currently open. You can:</p>

        <ul>
          <li>
            <Button appearance="primary" onClick={wrapAsync(openProject, 'Open project')}>
              Open
            </Button>{' '}
            an existing project
          </li>
          <li>
            <Button appearance="primary" onClick={() => setNewProjectModalOpen(true)}>
              Create
            </Button>{' '}
            a new project
          </li>
          <li>
            <p>
              Check out the{' '}
              <a href="#" onClick={openDocumentation}>
                Rivet 2 documentation
              </a>
            </p>
          </li>
          <li>
            <p>
              Open{' '}
              <a href="#" onClick={openSettings}>
                Settings
              </a>{' '}
              to configure providers, plugins, and UI preferences
            </p>
          </li>
        </ul>
      </div>
    </div>
  );
};
