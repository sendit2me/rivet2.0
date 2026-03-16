import { type FC } from 'react';
import TextField from '@atlaskit/textfield';
import Button from '@atlaskit/button';
import { css } from '@emotion/react';
import { type PluginInfo } from '../../plugins.js';
import { PluginCatalogItem } from './PluginCatalogItem.js';

const pluginCatalogStyles = css`
  .plugin-search {
    padding: 16px;
    border-bottom: 1px solid var(--grey);
  }

  .plugin {
    display: grid;
    grid-template-columns: 64px 200px 1fr auto;
    row-gap: 8px;
    column-gap: 32px;
    padding: 24px 16px;
    align-items: center;
    border-bottom: 1px solid var(--grey);
  }

  .plugin-icon {
    width: 64px;
    height: 64px;
    grid-column: 1;
    grid-row: 1 / -1;

    &.missing {
      border: 1px solid var(--grey);
    }

    img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }
  }

  .plugin-name {
    font-weight: 600;
  }

  .plugin-actions {
    display: flex;
    align-items: center;
    align-self: end;
    grid-column: -1;
  }

  .plugin-name-author {
    grid-column: 2;
  }

  .plugin-links {
    grid-column: 2;

    a {
      display: flex;
      align-items: center;
      gap: 8px;
    }

    svg {
      width: 16px;
      height: 16px;
    }
  }

  .plugin-description {
    grid-column: 3;
    grid-row: 1 / -1;
  }
`;

export const PluginCatalog: FC<{
  searchText: string;
  onSearchTextChange: (value: string) => void;
  plugins: PluginInfo[];
  isInstalled: (plugin: PluginInfo) => boolean;
  onAddPlugin: (plugin: PluginInfo) => void;
  onAddManualPlugin: () => void;
}> = ({ searchText, onSearchTextChange, plugins, isInstalled, onAddPlugin, onAddManualPlugin }) => {
  return (
    <div className="plugin-list" css={pluginCatalogStyles}>
      <div className="plugin-search">
        <TextField
          autoComplete="off"
          spellCheck={false}
          placeholder="Search..."
          value={searchText}
          onChange={(event) => onSearchTextChange((event.target as HTMLInputElement).value)}
        />
      </div>
      <div className="plugins">
        {plugins.map((pluginInfo) => (
          <PluginCatalogItem
            key={pluginInfo.id}
            plugin={pluginInfo}
            isInstalled={isInstalled(pluginInfo)}
            onAddPlugin={onAddPlugin}
          />
        ))}
        {!searchText && (
          <div className="plugin custom-plugin" key="custom-plugin">
            <div className="plugin-icon" />
            <div className="plugin-name-author">
              <div className="plugin-name">NPM Plugin</div>
            </div>
            <div className="plugin-description">Add a plugin from NPM manually</div>
            <div className="plugin-actions">
              <Button appearance="default" onClick={onAddManualPlugin}>
                Add
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
