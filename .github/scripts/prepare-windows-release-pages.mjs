import { copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourceBundleDir = path.resolve(
  repoRoot,
  process.env.SOURCE_BUNDLE_DIR ?? 'packages/app/src-tauri/target/release/bundle',
);
const pagesOutDir = path.resolve(repoRoot, process.env.PAGES_OUT_DIR ?? 'windows-release-pages');
const releaseChannel = process.env.RELEASE_CHANNEL ?? 'developer';

const releaseConfigs = {
  developer: {
    displayName: 'Developer',
    metadataFile: 'developer-release.json',
    stableFilePrefix: 'Rivet-2-Developer-Windows',
  },
  official: {
    displayName: 'Stable',
    metadataFile: 'official-release.json',
    stableFilePrefix: 'Rivet-2-Windows',
  },
};

const releaseConfig = releaseConfigs[releaseChannel];

if (!releaseConfig) {
  throw new Error(`Unsupported RELEASE_CHANNEL: ${releaseChannel}`);
}

const downloadsDir = path.join(pagesOutDir, 'downloads', releaseChannel);
const originalDownloadsDir = path.join(downloadsDir, 'original');
const releaseFilePattern = /\.(exe|msi|zip|sig|json|blockmap)$/i;

async function walkFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(directory, entry.name);

      if (entry.isDirectory()) {
        return walkFiles(entryPath);
      }

      return entry.isFile() ? [entryPath] : [];
    }),
  );

  return files.flat();
}

function toPagePath(filePath) {
  return filePath.split(path.sep).join('/');
}

function defaultPublishedSiteUrl() {
  const repository = process.env.GITHUB_REPOSITORY ?? 'valerypopoff/rivet2.0';
  const [owner, repo] = repository.split('/');
  return `https://${owner}.github.io/${repo}/`;
}

function normalizePublishedPath(url, publishedSiteUrl) {
  const parsedUrl = new URL(url, publishedSiteUrl);
  const siteUrl = new URL(publishedSiteUrl);

  if (parsedUrl.origin !== siteUrl.origin) {
    return null;
  }

  const sitePath = siteUrl.pathname.endsWith('/') ? siteUrl.pathname : `${siteUrl.pathname}/`;

  if (!parsedUrl.pathname.startsWith(sitePath)) {
    return null;
  }

  return decodeURIComponent(parsedUrl.pathname.slice(sitePath.length)).replace(/^\/+/, '');
}

async function writeUnderPagesRoot(relativePath, bytes) {
  const targetPath = path.resolve(pagesOutDir, relativePath);
  const relativeTarget = path.relative(pagesOutDir, targetPath);

  if (relativeTarget.startsWith('..') || path.isAbsolute(relativeTarget)) {
    throw new Error(`Refusing to write outside Pages output: ${relativePath}`);
  }

  await mkdir(path.dirname(targetPath), { recursive: true });
  await writeFile(targetPath, bytes);
}

function releaseAssetUrls(metadata) {
  return [
    ...(Array.isArray(metadata.stableDownloads) ? metadata.stableDownloads : []),
    ...(Array.isArray(metadata.artifacts) ? metadata.artifacts : []),
  ]
    .map((item) => item?.url)
    .filter((url) => typeof url === 'string' && url.length > 0);
}

async function preservePublishedRelease(metadataFile, publishedSiteUrl) {
  const metadataUrl = new URL(metadataFile, publishedSiteUrl);
  let response;

  try {
    response = await fetch(metadataUrl, { cache: 'no-store' });
  } catch (error) {
    console.warn(`Could not fetch existing ${metadataFile}; continuing without preserving it.`, error);
    return;
  }

  if (response.status === 404) {
    console.log(`No existing ${metadataFile} found on Pages; nothing to preserve.`);
    return;
  }

  if (!response.ok) {
    console.warn(`Could not fetch existing ${metadataFile}: ${response.status} ${response.statusText}`);
    return;
  }

  const metadataText = await response.text();
  let metadata;

  try {
    metadata = JSON.parse(metadataText);
  } catch (error) {
    console.warn(`Existing ${metadataFile} is not valid JSON; continuing without preserving it.`, error);
    return;
  }

  for (const assetUrl of releaseAssetUrls(metadata)) {
    const assetPath = normalizePublishedPath(assetUrl, publishedSiteUrl);

    if (!assetPath) {
      console.warn(`Skipping non-site release asset while preserving ${metadataFile}: ${assetUrl}`);
      continue;
    }

    try {
      const assetResponse = await fetch(new URL(assetPath, publishedSiteUrl), { cache: 'no-store' });

      if (!assetResponse.ok) {
        console.warn(`Could not preserve ${assetUrl}: ${assetResponse.status} ${assetResponse.statusText}`);
        continue;
      }

      const assetBytes = Buffer.from(await assetResponse.arrayBuffer());
      await writeUnderPagesRoot(assetPath, assetBytes);
    } catch (error) {
      console.warn(`Could not preserve ${assetUrl}; continuing.`, error);
    }
  }

  await writeUnderPagesRoot(metadataFile, metadataText);
  console.log(`Preserved existing ${metadataFile} from ${publishedSiteUrl}`);
}

function formatReleaseLabel(shortSha) {
  return process.env.RELEASE_LABEL ?? `${process.env.GITHUB_REF_NAME ?? releaseChannel}-${shortSha}`;
}

async function readAppVersion() {
  const appPackagePath = path.join(repoRoot, 'packages', 'app', 'package.json');
  const tauriConfigPath = path.join(repoRoot, 'packages', 'app', 'src-tauri', 'tauri.conf.json');
  const appPackage = JSON.parse(await readFile(appPackagePath, 'utf8'));
  const tauriConfig = JSON.parse(await readFile(tauriConfigPath, 'utf8'));
  const appVersion = appPackage?.version;
  const version = tauriConfig?.package?.version;

  if (typeof appVersion !== 'string' || appVersion.length === 0) {
    throw new Error(`Could not read version from ${appPackagePath}`);
  }

  if (typeof version !== 'string' || version.length === 0) {
    throw new Error(`Could not read package.version from ${tauriConfigPath}`);
  }

  if (version !== appVersion) {
    throw new Error(
      `Desktop version mismatch: ${appPackagePath} has ${appVersion}, but ${tauriConfigPath} has ${version}. Tauri bundle filenames use tauri.conf.json package.version.`,
    );
  }

  return appVersion;
}

async function main() {
  await stat(sourceBundleDir).catch(() => {
    throw new Error(`Tauri bundle directory does not exist: ${sourceBundleDir}`);
  });

  const preserveMetadataFiles = (process.env.PRESERVE_RELEASE_METADATA_FILES ?? '')
    .split(',')
    .map((file) => file.trim())
    .filter((file) => file.length > 0 && file !== releaseConfig.metadataFile);
  const publishedSiteUrl = process.env.PAGES_SITE_URL ?? defaultPublishedSiteUrl();

  for (const metadataFile of preserveMetadataFiles) {
    await preservePublishedRelease(metadataFile, publishedSiteUrl);
  }

  const bundleFiles = (await walkFiles(sourceBundleDir)).filter((file) => releaseFilePattern.test(file));

  if (bundleFiles.length === 0) {
    throw new Error(`No Windows release artifacts were found under ${sourceBundleDir}`);
  }

  await mkdir(originalDownloadsDir, { recursive: true });

  const artifacts = [];

  for (const sourcePath of bundleFiles) {
    const relativeSourcePath = path.relative(sourceBundleDir, sourcePath);
    const downloadPath = path.join(originalDownloadsDir, relativeSourcePath);
    await mkdir(path.dirname(downloadPath), { recursive: true });
    await copyFile(sourcePath, downloadPath);

    const fileStat = await stat(sourcePath);
    artifacts.push({
      name: path.basename(sourcePath),
      originalPath: toPagePath(relativeSourcePath),
      url: encodeURI(toPagePath(path.relative(pagesOutDir, downloadPath))),
      size: fileStat.size,
    });
  }

  artifacts.sort((a, b) => a.name.localeCompare(b.name));

  const primarySetup = artifacts.find((artifact) => /setup\.exe$/i.test(artifact.name));
  const primaryMsi = artifacts.find((artifact) => /\.msi$/i.test(artifact.name));
  const stableDownloads = [];

  if (primarySetup) {
    const sourcePath = path.join(originalDownloadsDir, primarySetup.originalPath);
    const stableName = `${releaseConfig.stableFilePrefix}-Setup.exe`;
    const stablePath = path.join(downloadsDir, stableName);
    await copyFile(sourcePath, stablePath);
    stableDownloads.push({
      label: 'Windows setup executable',
      name: stableName,
      url: encodeURI(toPagePath(path.relative(pagesOutDir, stablePath))),
      size: primarySetup.size,
    });
  }

  if (primaryMsi) {
    const sourcePath = path.join(originalDownloadsDir, primaryMsi.originalPath);
    const stableName = `${releaseConfig.stableFilePrefix}.msi`;
    const stablePath = path.join(downloadsDir, stableName);
    await copyFile(sourcePath, stablePath);
    stableDownloads.push({
      label: 'Windows MSI installer',
      name: stableName,
      url: encodeURI(toPagePath(path.relative(pagesOutDir, stablePath))),
      size: primaryMsi.size,
    });
  }

  const shortSha = (process.env.GITHUB_SHA ?? 'local').slice(0, 7);
  const repository = process.env.GITHUB_REPOSITORY ?? 'local/repo';
  const runId = process.env.GITHUB_RUN_ID;
  const serverUrl = process.env.GITHUB_SERVER_URL ?? 'https://github.com';
  const version = await readAppVersion();
  const releaseMetadata = {
    channel: releaseChannel,
    title: `${releaseConfig.displayName} Windows Release`,
    version,
    label: formatReleaseLabel(shortSha),
    generatedAt: new Date().toISOString(),
    branch: process.env.GITHUB_REF_NAME ?? releaseChannel,
    commit: process.env.GITHUB_SHA ?? 'local',
    runNumber: process.env.GITHUB_RUN_NUMBER ?? null,
    runUrl: runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : null,
    commitUrl: process.env.GITHUB_SHA ? `${serverUrl}/${repository}/commit/${process.env.GITHUB_SHA}` : null,
    stableDownloads,
    artifacts,
  };

  await mkdir(pagesOutDir, { recursive: true });
  await writeFile(path.join(pagesOutDir, releaseConfig.metadataFile), JSON.stringify(releaseMetadata, null, 2));

  console.log(`Prepared ${releaseChannel} Windows release downloads at ${pagesOutDir}`);
}

await main();
