import { HelperMessage, Label } from '@atlaskit/form';
import { type FC } from 'react';
import { useAtomValue } from 'jotai';
import { projectPluginsState } from '../state/savedGraphs';
import LightningIcon from 'majesticons/line/lightning-bolt-line.svg?react';
import InfoIcon from 'majesticons/line/info-circle-line.svg?react';
import { useToggle } from 'ahooks';
import { type PluginLoadSpec } from '@valerypopoff/rivet2-core';
import { css } from '@emotion/react';
import { PluginInfoModal } from './PluginInfoModal';
import { pluginsState } from '../state/plugins';
import { getPluginSpecLabel } from '../utils/pluginUsage';

const styles = css`
  font-size: var(--ui-font-size-compact);

  .label {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .label label {
    font-size: var(--ui-font-size-compact) !important;
  }

  .plugin-info-button {
    cursor: pointer;
    font-size: var(--ui-font-size-lg);
    color: var(--grey);
    transition:
      color 0.2s ease,
      border-color 0.2s ease;
    border-radius: 8px;
    corner-shape: squircle;
    border: 0;
    width: 24px;
    height: 24px;
    background: transparent;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 0;
    padding: 0;

    &:hover {
      border: 1px solid var(--foreground-bright);
      color: var(--foreground-bright);
    }
  }

  .helper {
    margin-top: 4px;
    font-size: var(--ui-font-size-compact);
  }

  .helper * {
    font-size: var(--ui-font-size-compact) !important;
  }

  .plugins-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin: 0;
    padding: 0;
    margin-top: 8px;
    font-size: var(--ui-font-size-compact);

    li {
      margin: 0;
      padding: 0;

      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      border-bottom: 1px solid var(--grey-darkish);
      padding: 4px 8px;

      .plugin-info {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex: 1;
        gap: 8px;
      }

      .plugin-id {
        display: flex;
        align-items: center;
        gap: 8px;
      }
    }
  }
`;

export const ProjectPluginsConfiguration: FC = () => {
  const pluginSpecs = useAtomValue(projectPluginsState);
  const hasPlugins = pluginSpecs.length > 0;

  return (
    <div css={styles}>
      <div className="label">
        <Label htmlFor="">{hasPlugins ? 'Plugins used by this project' : 'No plugins used by this project'}</Label>
      </div>
      <div className="helper">
        <HelperMessage>
          A plugin is listed here when one of its nodes exists in a project graph. Remove all nodes from that plugin to
          remove it from this project.
        </HelperMessage>
      </div>
      {hasPlugins && (
        <ul className="plugins-list">
          {pluginSpecs.map((spec, i) => (
            <PluginConfigurationItem spec={spec} key={`spec-${i}`} />
          ))}
        </ul>
      )}
    </div>
  );
};

const PluginConfigurationItem: FC<{ spec: PluginLoadSpec }> = ({ spec }) => {
  const [infoModalOpen, toggleInfoModal] = useToggle();

  const pluginStates = useAtomValue(pluginsState);
  const loadedPlugin = pluginStates.find((p) => p.spec.id === spec.id)?.plugin;
  const pluginName = loadedPlugin?.name ?? getPluginSpecLabel(spec);

  return (
    <li className="plugin">
      <div className="plugin-info">
        <div className="plugin-id">
          <LightningIcon style={{ flex: '0 0 auto' }} />
          {pluginName}
        </div>
      </div>
      <button className="plugin-info-button" onClick={toggleInfoModal.setRight} aria-label="Plugin info">
        <InfoIcon />
      </button>
      <PluginInfoModal
        isOpen={infoModalOpen}
        onClose={toggleInfoModal.setLeft}
        pluginName={pluginName}
        spec={spec}
        loadedPlugin={loadedPlugin}
      />
    </li>
  );
};
