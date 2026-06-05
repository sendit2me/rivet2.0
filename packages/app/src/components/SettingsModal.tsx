import { type FC, useState } from 'react';
import { atom, useAtom } from 'jotai';
import Modal, { ModalTransition, ModalBody } from '@atlaskit/modal-dialog';
import { SideNavigation, ButtonItem, NavigationContent } from '@atlaskit/side-navigation';
import { css } from '@emotion/react';
import { P, match } from 'ts-pattern';
import { useDependsOnPlugins } from '../hooks/useDependsOnPlugins';
import {
  CustomPluginsSettingsPage,
  GeneralSettingsPage,
  GraphsSettingsPage,
  OpenAiSettingsPage,
  PluginsCatalogPage,
  PluginsSettingsPage,
  UiSettingsPage,
  UpdatesSettingsPage,
} from './settings/SettingsPages';
import { AppModalHeader } from './AppModalHeader';

interface SettingsModalProps {}

export const settingsModalOpenState = atom(false);

const SETTINGS_MODAL_HEIGHT = 'calc(100vh - 48px)';

const modalBody = css`
  height: 100%;
  min-height: 300px;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr);
  min-width: 0;
  overflow: hidden;

  .settings-modal-sidebar {
    --ds-background-selected: color-mix(in srgb, var(--primary) 12%, transparent);
    --ds-background-selected-hovered: color-mix(in srgb, var(--primary) 16%, transparent);
    --ds-background-selected-pressed: color-mix(in srgb, var(--primary) 20%, transparent);
    --ds-border-selected: var(--primary);
    --ds-surface: var(--grey-dark-colorish);
    --ds-text-selected: var(--primary);
    align-self: stretch;
    background-color: var(--grey-dark-colorish);
    border-right: 1px solid var(--grey-darkish);
    max-height: 100%;
    min-height: 0;
    overflow-x: hidden;
    overflow-y: auto;
    padding-bottom: 20px;
  }

  .settings-modal-sidebar > nav {
    background-color: var(--grey-dark-colorish);
    max-width: 100%;
    overflow-x: hidden;
  }

  main {
    height: 100%;
    min-width: 0;
    min-height: 0;
    overflow: auto;
    padding: 0 30px 30px 30px;
  }

  main:not(.fill-page) > * {
    width: 100%;
    max-width: 850px;
  }

  main.fill-page {
    display: flex;
    flex-direction: column;
    overflow: hidden;

    > * {
      flex: 1 1 auto;
      min-height: 0;
    }
  }
`;

type DefaultPages = 'general' | 'graphs' | 'ui' | 'openai' | 'plugins' | 'pluginsSettings' | 'updates';
type Pages = DefaultPages | string;

const buttonsContainer = css`
  button,
  button span {
    font-size: var(--ui-font-size-base) !important;
    line-height: 1.25 !important;
  }

  > button {
    max-width: 100%;
  }

  > button span {
    overflow-x: hidden !important;
    text-overflow: ellipsis;
  }
`;

export const SettingsModal: FC<SettingsModalProps> = () => {
  const [isOpen, setIsOpen] = useAtom(settingsModalOpenState);
  const [page, setPage] = useState<Pages>('general');
  const plugins = useDependsOnPlugins();

  const pluginsWithCustomPages = plugins.filter((plugin) => plugin.configPage !== undefined);
  const customPluginsPages = Object.fromEntries(
    pluginsWithCustomPages.map((plugin) => [
      plugin.id,
      <CustomPluginsSettingsPage key={plugin.id} pluginId={plugin.id} />,
    ]),
  );

  return (
    <ModalTransition>
      {isOpen && (
        <Modal onClose={() => setIsOpen(false)} width="80%" height={SETTINGS_MODAL_HEIGHT}>
          <AppModalHeader title="Settings" onClose={() => setIsOpen(false)} />
          <ModalBody>
            <div css={modalBody}>
              <aside className="settings-modal-sidebar">
                <SideNavigation label="settings">
                  <NavigationContent>
                    <div css={buttonsContainer}>
                      <ButtonItem isSelected={page === 'general'} onClick={() => setPage('general')}>
                        General
                      </ButtonItem>
                      <ButtonItem isSelected={page === 'graphs'} onClick={() => setPage('graphs')}>
                        Graphs
                      </ButtonItem>
                      <ButtonItem isSelected={page === 'ui'} onClick={() => setPage('ui')}>
                        UI
                      </ButtonItem>
                      <ButtonItem isSelected={page === 'openai'} onClick={() => setPage('openai')}>
                        OpenAI
                      </ButtonItem>
                      <ButtonItem isSelected={page === 'plugins'} onClick={() => setPage('plugins')}>
                        Plugins
                      </ButtonItem>
                      <ButtonItem isSelected={page === 'pluginsSettings'} onClick={() => setPage('pluginsSettings')}>
                        Plugins settings
                      </ButtonItem>
                      <ButtonItem isSelected={page === 'updates'} onClick={() => setPage('updates')}>
                        Updates
                      </ButtonItem>
                      {pluginsWithCustomPages.map((plugin) => (
                        <ButtonItem key={plugin.id} isSelected={page === plugin.id} onClick={() => setPage(plugin.id)}>
                          {plugin.configPage!.label}
                        </ButtonItem>
                      ))}
                    </div>
                  </NavigationContent>
                </SideNavigation>
              </aside>
              <main className={page === 'plugins' ? 'fill-page' : undefined}>
                {match(page)
                  .with('general', () => <GeneralSettingsPage />)
                  .with('graphs', () => <GraphsSettingsPage />)
                  .with('ui', () => <UiSettingsPage />)
                  .with('openai', () => <OpenAiSettingsPage />)
                  .with('plugins', () => <PluginsCatalogPage />)
                  .with('pluginsSettings', () => <PluginsSettingsPage />)
                  .with('updates', () => <UpdatesSettingsPage />)
                  .with(P.string, (id) => customPluginsPages[id])
                  .exhaustive()}
              </main>
            </div>
          </ModalBody>
        </Modal>
      )}
    </ModalTransition>
  );
};
