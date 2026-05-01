import { type PackagePluginLoadSpec, type RivetPlugin } from '@ironclad/rivet-core';
import * as Rivet from '@ironclad/rivet-core';
import semverGt from 'semver/functions/gt';
import { useState } from 'react';
import {
  NativeResponseType,
  nativeFetch,
  nativeHttpClientGet,
} from '../utils/platform/http.js';
import { invokeNative } from '../utils/platform/core.js';
import {
  nativeCreateDir,
  nativeExists,
  nativeReadTextFile,
  nativeRemoveDir,
  nativeWriteBinaryFile,
  nativeWriteTextFile,
} from '../utils/platform/fs.js';
import { nativeAppLocalDataDir, nativeJoinPath } from '../utils/platform/path.js';
import { createNativeSidecarCommand } from '../utils/platform/shell.js';
import { importPluginInitializer } from '../utils/pluginInitializer.js';

export function useLoadPackagePlugin(options: { onLog?: (message: string) => void } = {}) {
  const [packageInstallLog, setPackageInstallLog] = useState('');

  const log = (message: string) => {
    setPackageInstallLog((prev) => `${prev}${message}`);
    options.onLog?.(message);
  };

  const fetchNpmPackageData = async <T>(spec: PackagePluginLoadSpec): Promise<T> => {
    const response = await nativeFetch<T>(`https://registry.npmjs.org/${spec.package}/${spec.tag}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    if (response.status === 404) {
      throw new Error(`Plugin not found on NPM: ${spec.package}@${spec.tag}`);
    }

    if (response.status !== 200) {
      throw new Error(`Error loading plugin from NPM: ${spec.package}@${spec.tag}`);
    }

    return response.data;
  };

  const loadPackagePlugin = async (spec: PackagePluginLoadSpec): Promise<RivetPlugin> => {
    const localDataDir = await nativeAppLocalDataDir();

    const pluginDir = await nativeJoinPath(localDataDir, `plugins/${spec.package}-${spec.tag}`);
    const pluginFilesPath = await nativeJoinPath(pluginDir, 'package');
    const packageJsonPath = await nativeJoinPath(pluginFilesPath, 'package.json');

    let needsReinstall = false;

    try {
      if (await nativeExists(pluginFilesPath)) {
        if (await nativeExists(packageJsonPath)) {
          log(`Checking for plugin updates: ${spec.package}@${spec.tag}\n`);
          const { version } = JSON.parse(await nativeReadTextFile(packageJsonPath));
          const { version: latestVersion } = await fetchNpmPackageData<{ version: string }>(spec);

          if (semverGt(latestVersion, version)) {
            log(`Plugin update available: ${spec.package}@${spec.tag} -> ${latestVersion}\n`);
            needsReinstall = true;
          }

          if (!(await nativeExists(await nativeJoinPath(pluginFilesPath, 'node_modules')))) {
            needsReinstall = true;
          }
        }
      } else {
        needsReinstall = true;
      }
    } catch (err) {
      needsReinstall = true;
    }

    const completedInstallVersionFile = await nativeJoinPath(pluginFilesPath, '.install_complete_version');
    if (await nativeExists(completedInstallVersionFile)) {
      const version = await nativeReadTextFile(completedInstallVersionFile);
      if (version !== spec.tag) {
        needsReinstall = true;
      }
    } else {
      needsReinstall = true;
    }

    if (await nativeExists(await nativeJoinPath(pluginFilesPath, '.git'))) {
      needsReinstall = false;
      log(`Plugin is a git repository, skipping reinstall: ${spec.package}@${spec.tag}\n`);
    }

    if (needsReinstall) {
      if (await nativeExists(pluginDir)) {
        log(`Removing existing plugin: ${spec.package}@${spec.tag}\n`);
        await nativeRemoveDir(pluginDir, {
          recursive: true,
        });
      }

      log(`Plugin not found locally or needs reinstall: ${spec.package}@${spec.tag}, downloading from NPM...\n`);

      // Download from NPM and install to plugins directory
      const {
        dist: { tarball },
      } = await fetchNpmPackageData<{ dist: { tarball: string } }>(spec);

      log(`Downloading plugin tarball from NPM: ${tarball}\n`);

      const tarballData = await nativeHttpClientGet<number[]>(tarball, {
        headers: {
          Accept: 'application/octet-stream',
        },
        responseType: NativeResponseType.Binary,
      });

      log(`Downloaded plugin tarball from NPM: ${tarball}\n`);

      const tarDestination = await nativeJoinPath(pluginDir, 'package.tgz');
      const data = new Uint8Array(tarballData.data as number[]);

      await nativeCreateDir(pluginDir, {
        recursive: true,
      });

      await nativeWriteBinaryFile(tarDestination, data);

      await invokeNative('extract_package_plugin_tarball', {
        path: tarDestination,
      });

      if (await nativeExists(packageJsonPath)) {
        const packageJsonContents = JSON.parse(await nativeReadTextFile(packageJsonPath));

        const installDisabled = packageJsonContents?.rivet?.skipInstall;
        if (!installDisabled) {
          log('Installing NPM dependencies...\n');

          const command = await createNativeSidecarCommand('../sidecars/pnpm/pnpm', ['install', '--prod', '--ignore-scripts'], {
            cwd: pluginFilesPath,
          });

          command.stdout.on('data', (data) => {
            log(data + '\n');
          });

          command.stderr.on('data', (data) => {
            log(data + '\n');
          });

          const result = await command.execute();

          if (result.code !== 0) {
            throw new Error(`Error installing plugin dependencies: ${spec.package}@${spec.tag}: ${result.stderr}`);
          }

          log('Installed NPM dependencies\n');
        } else {
          log('Skipping NPM dependencies install\n');
        }
      }

      await nativeWriteTextFile(completedInstallVersionFile, spec.tag);
    }

    if (!(await nativeExists(packageJsonPath))) {
      throw new Error(`Plugin package.json not found: ${spec.package}@${spec.tag}`);
    }

    const packageJsonContents = JSON.parse(await nativeReadTextFile(packageJsonPath));

    const main = packageJsonContents.main;

    log(`Reading plugin main file: ${main}\n`);
    const mainContents = await nativeReadTextFile(`${pluginFilesPath}/${main}`);

    if (!mainContents) {
      throw new Error(`Plugin main file not found: ${spec.package}@${spec.tag}`);
    }

    log(`Converting plugin main file to base64\n`);
    const b64Contents = await Rivet.uint8ArrayToBase64(new TextEncoder().encode(mainContents));

    try {
      log(`Initializing plugin: ${spec.package}@${spec.tag}\n`);
      const pluginInitializer = await importPluginInitializer(
        `data:application/javascript;base64,${b64Contents}`,
        `${spec.package}@${spec.tag}`,
      );
      const initializedPlugin = pluginInitializer(Rivet);

      return initializedPlugin;
    } catch (e) {
      throw new Error(`Error loading plugin: ${spec.package}@${spec.tag}: ${Rivet.getError(e).message}`);
    }
  };

  return {
    loadPackagePlugin,
    packageInstallLog,
    setPackageInstallLog,
  };
}
