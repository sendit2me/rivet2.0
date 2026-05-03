import { css } from '@emotion/react';
import { useState, type FC } from 'react';
import { useAtomValue } from 'jotai';
import { overlayOpenState } from '../../state/ui';
import { ErrorBoundary } from 'react-error-boundary';
import { SideNavigation, ButtonItem, Section } from '@atlaskit/side-navigation';
import { match } from 'ts-pattern';
import { useIsLoggedInToCommunity } from '../../hooks/useIsLoggedInToCommunity';
import { MyProfilePage } from './MyProfilePage';
import { MyTemplatesPage } from './MyTemplatesPage';
import { NeedsLoginPage } from './NeedsLoginPage';
import { CommunityTemplatesPage } from './CommunityTemplatesPage';

const styles = css`
  position: fixed;
  top: var(--project-selector-height);
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--grey-darker);
  z-index: 150;
  overflow: hidden;

  .content {
    display: grid;
    grid-template-columns: 300px 1fr;
    height: 100%;
  }

  .left-sidebar {
    user-select: none;
    height: 100%;
    background-color: var(--grey-darker);
    border-right: 1px solid var(--grey);
    z-index: 2;
    overflow: auto;

    header {
      padding: 8px 16px;
      border-bottom: 1px solid var(--grey);

      h1 {
        margin: 0;
        font-size: var(--ui-font-size-xl);
        line-height: 1.4;
      }
    }
  }

  .selected-nav-area {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-height: 0;
    overflow: auto;
    padding: 32px;
  }
`;

export const CommunityOverlayRenderer: FC = () => {
  const openOverlay = useAtomValue(overlayOpenState);

  if (openOverlay !== 'community') return null;

  return (
    <ErrorBoundary fallbackRender={() => 'Failed to render Community overlay'}>
      <CommunityOverlay />
    </ErrorBoundary>
  );
};

export const CommunityOverlay: FC = () => {
  const [selectedNav, setSelectedNav] = useState('community-templates');

  return (
    <div css={styles}>
      <div className="content">
        <div className="left-sidebar">
          <header>
            <h1>Rivet Community</h1>
          </header>
          <SideNavigation label="Rivet Community">
            <Section title="Templates">
              <ButtonItem
                isSelected={selectedNav === 'community-templates'}
                onClick={() => setSelectedNav('community-templates')}
              >
                ⭐ Community Templates
              </ButtonItem>
            </Section>
            <Section title="Me">
              <ButtonItem isSelected={selectedNav === 'my-profile'} onClick={() => setSelectedNav('my-profile')}>
                My Profile
              </ButtonItem>
              <ButtonItem isSelected={selectedNav === 'my-templates'} onClick={() => setSelectedNav('my-templates')}>
                My Templates
              </ButtonItem>
            </Section>
            <Section title="Links">
              <ButtonItem>Discord</ButtonItem>
            </Section>
          </SideNavigation>
        </div>
        <div className="selected-nav-area">
          {match(selectedNav)
            .with('community-templates', () => <CommunityTemplatesPage />)
            .with('my-profile', () => (
              <NeedsProfile>
                <MyProfilePage />
              </NeedsProfile>
            ))
            .with('my-templates', () => (
              <NeedsProfile>
                <MyTemplatesPage />
              </NeedsProfile>
            ))
            .otherwise(() => `Unknown nav: ${selectedNav}`)}
        </div>
      </div>
    </div>
  );
};

export const NeedsProfile: FC<{ children: React.ReactNode }> = ({ children }) => {
  const isLoggedIn = useIsLoggedInToCommunity();

  if (isLoggedIn === undefined) {
    return null;
  }

  if (!isLoggedIn) return <NeedsLoginPage />;

  return <>{children}</>;
};
