import { HelperMessage } from '@atlaskit/form';
import { type FC, useState } from 'react';
import { useToggle } from 'ahooks';
import { toast } from 'react-toastify';
import { getError, type PackagePluginLoadSpec, type PluginLoadSpec } from '@ironclad/rivet-core';
import CopyIcon from 'majesticons/line/clipboard-line.svg?react';
import { copyToClipboard } from '../utils/copyToClipboard';
import { useLoadPackagePlugin } from '../hooks/useLoadPackagePlugin';
import { appPluginSpecsState } from '../state/plugins';
import useAsyncEffect from 'use-async-effect';
import { type BuiltInPluginInfo, type PackagePluginInfo, pluginInfos, type PluginInfo } from '../plugins.js';
import { useFuseSearch } from '../hooks/useFuseSearch';
import { overlayOpenState } from '../state/ui';
import { ErrorBoundary } from 'react-error-boundary';
import { useAtom, useAtomValue } from 'jotai';
import { handleError, wrapAsync } from '../utils/errorHandling';
import { nativeAppLocalDataDir, nativeJoinPath } from '../utils/platform/path.js';
import { PluginCatalog } from './pluginsOverlay/PluginCatalog.js';
import { AddNpmPluginModal, PluginLogModal } from './pluginsOverlay/PluginInstallModals.js';
import { pluginsOverlayBodyStyles, pluginsOverlayStyles } from './pluginsOverlay/pluginsOverlayStyles.js';
import { dedupePluginSpecs, getPluginSpecId, getPluginSpecLabel } from '../utils/pluginUsage.js';

export const PluginsOverlayRenderer: FC = () => {
  const openOverlay = useAtomValue(overlayOpenState);

  if (openOverlay !== 'plugins') return null;

  return (
    <ErrorBoundary fallbackRender={() => 'Failed to render Plugins overlay'}>
      <PluginsOverlay />
    </ErrorBoundary>
  );
};

export const PluginsOverlay: FC = () => {
  const { loadPackagePlugin, packageInstallLog, setPackageInstallLog } = useLoadPackagePlugin({
    onLog: (msg) => console.log(msg),
  });
  const [pluginSpecs, setPluginSpecs] = useAtom(appPluginSpecsState);
  const [searchText, setSearchText] = useState('');

  const isPluginInstalledInApp = (plugin: PluginInfo): boolean => {
    return pluginSpecs.some((spec) => getPluginSpecId(spec) === plugin.id);
  };

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

  const [pluginStoreDirectory, setPluginStoreDirectory] = useState('');

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
    copyToClipboard(pluginStoreDirectory);
    toast.success('Copied plugin store directory to clipboard');
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
    <div css={pluginsOverlayStyles}>
      <header>
        <h1>Plugin</h1>
      </header>
      <main>
        <div css={pluginsOverlayBodyStyles}>
          <PluginCatalog
            searchText={searchText}
            onSearchTextChange={setSearchText}
            plugins={searchedPlugins.map(({ item }) => item)}
            installedExtraSpecs={extraInstalledPluginSpecs}
            isInstalled={isPluginInstalledInApp}
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
        </div>
      </main>
      <footer>
        <div className="helperMessage">
          <HelperMessage>
            Plugins are stored in: <code>{pluginStoreDirectory}</code>{' '}
            <CopyIcon className="copy-plugin-dir-button" onClick={copyPluginStoreDirectory} />
          </HelperMessage>
        </div>
      </footer>
    </div>
  );
};
