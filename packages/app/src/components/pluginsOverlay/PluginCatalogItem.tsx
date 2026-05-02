import { type FC, useLayoutEffect, useRef } from 'react';
import Button from '@atlaskit/button';
import GithubMark from '../../assets/vendor_logos/github-mark-white.svg?react';
import clsx from 'clsx';
import { useMarkdown } from '../../hooks/useMarkdown.js';
import { type PluginInfo } from '../../plugins.js';

export const PluginCatalogItem: FC<{
  plugin: PluginInfo;
  isInstalled: boolean;
  onAddPlugin: (plugin: PluginInfo) => void;
  onRemovePlugin: (plugin: PluginInfo) => void;
}> = ({ plugin, isInstalled, onAddPlugin, onRemovePlugin }) => {
  const markdownDescription = useMarkdown(plugin.description);
  const itemRef = useRef<HTMLDivElement>(null);

  // Markdown links open new because tauri
  useLayoutEffect(() => {
    itemRef.current?.querySelectorAll('a').forEach((anchor) => {
      anchor.target = '_blank';
    });
  }, []);

  return (
    <div className="plugin" key={plugin.id} ref={itemRef}>
      <div className={clsx('plugin-icon', { missing: !plugin.logoImage })}>
        {plugin.logoImage && <img src={plugin.logoImage} alt={plugin.name} />}
      </div>
      <div className="plugin-name-author">
        <div className="plugin-name">{plugin.name}</div>
        <div className="plugin-author">By: {plugin.author}</div>
        {(plugin.github || plugin.website || plugin.documentation) && (
          <div className="plugin-links">
            {plugin.github && (
              <a className="plugin-github" href={plugin.github} target="_blank" rel="noreferrer">
                <GithubMark viewBox="0 0 100 100" /> GitHub
              </a>
            )}
            {plugin.website && (
              <a className="plugin-website" href={plugin.website} target="_blank" rel="noreferrer">
                Website
              </a>
            )}
            {plugin.documentation && (
              <a className="plugin-docs" href={plugin.documentation} target="_blank" rel="noreferrer">
                Docs
              </a>
            )}
          </div>
        )}
      </div>
      <div className="plugin-description" dangerouslySetInnerHTML={markdownDescription}></div>
      <div className="plugin-actions">
        {isInstalled ? (
          <>
            <span className="installed">Installed</span>
            <Button appearance="danger" onClick={() => onRemovePlugin(plugin)}>
              Remove
            </Button>
          </>
        ) : (
          <Button appearance="primary" onClick={() => onAddPlugin(plugin)}>
            Add
          </Button>
        )}
      </div>
    </div>
  );
};
