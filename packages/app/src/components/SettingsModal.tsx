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
  PluginsSettingsPage,
  UiSettingsPage,
  UpdatesSettingsPage,
} from './settings/SettingsPages';
import { AppModalHeader } from './AppModalHeader';

interface SettingsModalProps {}

export const settingsModalOpenState = atom(false);

const modalBody = css`
  min-height: 300px;
  display: grid;
  grid-template-columns: 240px 1fr;

  nav {
    padding-bottom: 20px;
  }

  main {
    padding: 0 30px 100px 30px;
  }
`;

type DefaultPages = 'general' | 'graphs' | 'ui' | 'openai' | 'plugins' | 'updates';
type Pages = DefaultPages | string;

const buttonsContainer = css`
  button,
  button span {
    font-size: var(--ui-font-size-base) !important;
    line-height: 1.25 !important;
  }

  > button span {
    overflow-x: visible !important;
  }
`;

export const SettingsModal: FC<SettingsModalProps> = () => {
  const [isOpen, setIsOpen] = useAtom(settingsModalOpenState);
  const [page, setPage] = useState<Pages>('general');
  const plugins = useDependsOnPlugins();

  const pluginsWithCustomPages = plugins.filter((plugin) => plugin.configPage !== undefined);
  const customPluginsPages = Object.fromEntries(
    pluginsWithCustomPages.map((plugin) => [plugin.id, <CustomPluginsSettingsPage key={plugin.id} pluginId={plugin.id} />]),
  );

  return (
    <ModalTransition>
      {isOpen && (
        <Modal onClose={() => setIsOpen(false)} width="80%">
          <AppModalHeader title="Settings" onClose={() => setIsOpen(false)} />
          <ModalBody>
            <div css={modalBody}>
              <nav>
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
              </nav>
              <main>
                {match(page)
                  .with('general', () => <GeneralSettingsPage />)
                  .with('graphs', () => <GraphsSettingsPage />)
                  .with('ui', () => <UiSettingsPage />)
                  .with('openai', () => <OpenAiSettingsPage />)
                  .with('plugins', () => <PluginsSettingsPage />)
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
