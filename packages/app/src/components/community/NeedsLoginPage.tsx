import Button from '@atlaskit/button';
import { type FC } from 'react';
import { useSetAtom } from 'jotai';
import { getCommunityLoginUrl } from '../../utils/getCommunityApi';
import { isLoggedInToCommunityState } from '../../state/community';
import { createWebviewWindowHandle } from '../../utils/platform/window.js';
import { handleError } from '../../utils/errorHandling.js';

export const NeedsLoginPage: FC = () => {
  const loginUrl = getCommunityLoginUrl();
  const setIsLoggedInToCommunity = useSetAtom(isLoggedInToCommunityState);

  const handleLogInClick = async () => {
    const window = await createWebviewWindowHandle('login', { alwaysOnTop: true, center: true, url: loginUrl });

    await window.once?.('tauri://created', () => {
      console.log('window created');
    });

    await window.once?.('tauri://error', (e) => {
      handleError(e, 'Community login window error', {
        metadata: {
          loginUrl,
        },
        toastError: false,
      });
    });

    await window.onCloseRequested?.(() => {
      setIsLoggedInToCommunity(undefined);
    });
  };

  return (
    <div className="needs-login">
      <h1>Log in to Rivet Community</h1>
      <p>Log in to Rivet Community to:</p>
      <ul>
        <li>Share your templates with others</li>
        <li>Star and comment on other templates</li>
      </ul>
      <p>
        <Button
          appearance="primary"
          onClick={() => {
            void handleLogInClick();
          }}
        >
          Log in
        </Button>
      </p>
    </div>
  );
};
