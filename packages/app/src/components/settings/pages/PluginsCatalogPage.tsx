import { HelperMessage } from '@atlaskit/form';
import { css } from '@emotion/react';
import { type PackagePluginLoadSpec, type PluginLoadSpec, getError } from '@rivet2/rivet-core';
import { useToggle } from 'ahooks';
import { useAtom } from 'jotai';
import CopyIcon from 'majesticons/line/clipboard-line.svg?react';
import { type FC, useState } from 'react';
import { toast } from 'react-toastify';
import useAsyncEffect from 'use-async-effect';
import { useFuseSearch } from '../../../hooks/useFuseSearch.js';
import { useLoadPackagePlugin } from '../../../hooks/useLoadPackagePlugin.js';
import { type BuiltInPluginInfo, type PackagePluginInfo, type PluginInfo, pluginInfos } from '../../../plugins.js';
import { appPluginSpecsState } from '../../../state/plugins.js';
import { copyToClipboard } from '../../../utils/copyToClipboard.js';
import { handleError, wrapAsync } from '../../../utils/errorHandling.js';
import { nativeAppLocalDataDir, nativeJoinPath } from '../../../utils/platform/path.js';
import { dedupePluginSpecs, getPluginSpecId, getPluginSpecLabel } from '../../../utils/pluginUsage.js';
import { AddNpmPluginModal, PluginLogModal } from '../../pluginsOverlay/PluginInstallModals.js';
import { PluginCatalog } from '../../pluginsOverlay/PluginCatalog.js';

const pluginsCatalogPageStyles = css`
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;

  .add-npm-plugin {
    display: flex;
    flex-direction: column;
    gap: 8px;

    .inputs {
      display: grid;
      grid-template-columns: 3fr 1fr;
      column-gap: 8px;
    }
  }

  .helperMessage > div > span {
    display: inline-flex;
    align-items: center;
    gap: 8px;

    code {
      line-height: 11px;
      font-size: var(--ui-font-size-xs);
    }

    .copy-plugin-dir-button {
      cursor: pointer;

      &:hover {
        color: white;
      }
    }
  }

  .plugin-list {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
    position: relative;
    background: var(--grey-dark);
    border: 1px solid var(--grey);
  }

  .plugins {
    flex: 1 1 auto;
    min-height: 0;
    overflow: auto;
  }
`;

export const PluginsCatalogPage: FC = () => {
  const { loadPackagePlugin, packageInstallLog, setPackageInstallLog } = useLoadPackagePlugin({
    onLog: (msg) => console.log(msg),
  });
  const [pluginSpecs, setPluginSpecs] = useAtom(appPluginSpecsState);
  const [searchText, setSearchText] = useState('');
  const [pluginStoreDirectory, setPluginStoreDirectory] = useState('');
  const [pluginLogModalOpen, togglePluginLogModal] = useToggle();
  const [addNPMPluginModalOpen, toggleAddNPMPluginModal] = useToggle();

  const addPluginSpec = (spec: PluginLoadSpec) => {
    setPluginSpecs((currentSpecs) => dedupePluginSpecs([...currentSpecs, spec]));
  };

  const removePluginSpecById = (pluginId: string, pluginName: string) => {
    setPluginSpecs((currentSpecs) => currentSpecs.filter((spec) => getPluginSpecId(spec) !== pluginId));
    toast.success(`Removed ${pluginName} from this Rivet app`);
  };

  const removePlugin = (info: PluginInfo) => {
    removePluginSpecById(info.id, info.name);
  };

  const removePluginSpec = (spec: PluginLoadSpec) => {
    removePluginSpecById(getPluginSpecId(spec), getPluginSpecLabel(spec));
  };

  const addBuiltInPlugin = (info: BuiltInPluginInfo) => {
    addPluginSpec({
      id: info.id,
      type: 'built-in',
      name: info.name,
    });
  };

  const addPackagePlugin = async (info: PackagePluginInfo) => {
    togglePluginLogModal.setRight();

    const spec: PackagePluginLoadSpec = {
      type: 'package',
      id: `${info.package}@${info.tag}`,
      package: info.package,
      tag: info.tag,
    };

    try {
      setPackageInstallLog(`Installing plugin: ${info.name}...\n`);
      await loadPackagePlugin(spec);
      togglePluginLogModal.setLeft();
      toggleAddNPMPluginModal.setLeft();
      addPluginSpec(spec);
    } catch (err) {
      setPackageInstallLog((log) => `${log}\nError installing plugin: ${getError(err).message}`);
    }
  };

  const addPlugin = (info: PluginInfo) => {
    if (info.type === 'built-in') {
      addBuiltInPlugin(info);
    } else if (info.type === 'package') {
      addPackagePlugin(info);
    }
  };

  useAsyncEffect(async () => {
    try {
      const appDataDir = await nativeAppLocalDataDir();
      setPluginStoreDirectory(await nativeJoinPath(appDataDir, 'plugins'));
    } catch (err) {
      handleError(err, 'Failed to resolve plugin store directory', {
        toastError: false,
      });
    }
  }, []);

  const copyPluginStoreDirectory = async () => {
    await copyToClipboard(pluginStoreDirectory);
  };

  const catalogPluginIds = new Set(pluginInfos.map((plugin) => plugin.id));
  const extraInstalledPluginSpecs = pluginSpecs.filter((spec) => !catalogPluginIds.has(getPluginSpecId(spec)));
  const sortedPlugins = [...pluginInfos].sort((a, b) => a.name.localeCompare(b.name));
  const searchedPlugins = useFuseSearch(sortedPlugins, searchText, [
    'id',
    'name',
    'description',
    'author',
    'github',
    'website',
  ]);

  return (
    <div css={pluginsCatalogPageStyles}>
      <PluginCatalog
        searchText={searchText}
        onSearchTextChange={setSearchText}
        plugins={searchedPlugins.map(({ item }) => item)}
        installedExtraSpecs={extraInstalledPluginSpecs}
        isInstalled={(plugin) => pluginSpecs.some((spec) => getPluginSpecId(spec) === plugin.id)}
        onAddPlugin={addPlugin}
        onRemovePlugin={removePlugin}
        onRemovePluginSpec={removePluginSpec}
        onAddManualPlugin={toggleAddNPMPluginModal.setRight}
      />
      <AddNpmPluginModal
        isOpen={addNPMPluginModalOpen}
        onClose={toggleAddNPMPluginModal.setLeft}
        onAddPlugin={wrapAsync(addPackagePlugin, 'Install package plugin')}
        pluginStoreDirectory={pluginStoreDirectory}
      />
      <PluginLogModal isOpen={pluginLogModalOpen} log={packageInstallLog} onClose={togglePluginLogModal.setLeft} />
      <div className="helperMessage">
        <HelperMessage>
          Plugins are stored in: <code>{pluginStoreDirectory}</code>{' '}
          <CopyIcon className="copy-plugin-dir-button" onClick={copyPluginStoreDirectory} />
        </HelperMessage>
      </div>
    </div>
  );
};
