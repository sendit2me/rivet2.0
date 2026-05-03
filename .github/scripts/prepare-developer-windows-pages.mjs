import { copyFile, mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const sourceBundleDir = path.resolve(
  repoRoot,
  process.env.SOURCE_BUNDLE_DIR ?? 'packages/app/src-tauri/target/release/bundle',
);
const pagesOutDir = path.resolve(repoRoot, process.env.PAGES_OUT_DIR ?? 'developer-release-pages');
const downloadsDir = path.join(pagesOutDir, 'downloads');
const originalDownloadsDir = path.join(downloadsDir, 'original');
const shouldWriteStandalonePage = process.env.DEVELOPER_RELEASE_STANDALONE_PAGE !== 'false';

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

function htmlEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

async function main() {
  await stat(sourceBundleDir).catch(() => {
    throw new Error(`Tauri bundle directory does not exist: ${sourceBundleDir}`);
  });

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
    const stableName = 'Rivet-Developer-Windows-Setup.exe';
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
    const stableName = 'Rivet-Developer-Windows.msi';
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
  const releaseMetadata = {
    label: process.env.DEVELOPER_RELEASE_LABEL ?? `${process.env.GITHUB_REF_NAME ?? 'develop'}-${shortSha}`,
    generatedAt: new Date().toISOString(),
    branch: process.env.GITHUB_REF_NAME ?? 'develop',
    commit: process.env.GITHUB_SHA ?? 'local',
    runNumber: process.env.GITHUB_RUN_NUMBER ?? null,
    runUrl: runId ? `${serverUrl}/${repository}/actions/runs/${runId}` : null,
    commitUrl: process.env.GITHUB_SHA ? `${serverUrl}/${repository}/commit/${process.env.GITHUB_SHA}` : null,
    stableDownloads,
    artifacts,
  };

  await mkdir(pagesOutDir, { recursive: true });
  await writeFile(path.join(pagesOutDir, 'developer-release.json'), JSON.stringify(releaseMetadata, null, 2));

  if (shouldWriteStandalonePage) {
    const stableDownloadMarkup =
      stableDownloads.length > 0
        ? stableDownloads
            .map(
              (download) => `
              <a class="primary-download" href="${htmlEscape(download.url)}">
                ${htmlEscape(download.label)}
                <span>${htmlEscape(download.name)} - ${formatBytes(download.size)}</span>
              </a>`,
            )
            .join('\n')
        : '<p class="empty">No stable installer alias was produced. See original artifacts below.</p>';

    const artifactRows = artifacts
      .map(
        (artifact) => `
        <tr>
          <td><a href="${htmlEscape(artifact.url)}">${htmlEscape(artifact.name)}</a></td>
          <td>${htmlEscape(artifact.originalPath)}</td>
          <td>${formatBytes(artifact.size)}</td>
        </tr>`,
      )
      .join('\n');

    const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Rivet Developer Release for Windows</title>
    <style>
      :root {
        color-scheme: dark;
        font-family: Inter, Segoe UI, Arial, sans-serif;
        background: #161b22;
        color: #e6edf3;
      }

      body {
        margin: 0;
        padding: 40px 24px;
      }

      main {
        max-width: 960px;
        margin: 0 auto;
      }

      h1 {
        margin: 0 0 8px;
        font-size: 32px;
      }

      .meta {
        color: #9da7b1;
        margin-bottom: 28px;
      }

      .downloads {
        display: grid;
        gap: 12px;
        margin-bottom: 32px;
      }

      .primary-download {
        display: block;
        padding: 18px 20px;
        border: 1px solid #3d4652;
        border-radius: 8px;
        background: #21262d;
        color: #79c0ff;
        font-weight: 700;
        text-decoration: none;
      }

      .primary-download span {
        display: block;
        margin-top: 6px;
        color: #c9d1d9;
        font-size: 14px;
        font-weight: 400;
      }

      table {
        width: 100%;
        border-collapse: collapse;
        background: #21262d;
        border-radius: 8px;
        overflow: hidden;
      }

      th,
      td {
        padding: 12px 14px;
        border-bottom: 1px solid #30363d;
        text-align: left;
        vertical-align: top;
      }

      th {
        color: #c9d1d9;
        font-size: 13px;
        text-transform: uppercase;
      }

      a {
        color: #79c0ff;
      }

      .empty {
        color: #f0c674;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>Rivet Developer Release for Windows</h1>
      <div class="meta">
        Branch: ${htmlEscape(releaseMetadata.branch)} |
        Commit: ${releaseMetadata.commitUrl ? `<a href="${htmlEscape(releaseMetadata.commitUrl)}">${htmlEscape(shortSha)}</a>` : htmlEscape(shortSha)} |
        Build: ${releaseMetadata.runUrl ? `<a href="${htmlEscape(releaseMetadata.runUrl)}">${htmlEscape(releaseMetadata.label)}</a>` : htmlEscape(releaseMetadata.label)}
      </div>

      <section class="downloads">
        ${stableDownloadMarkup}
      </section>

      <h2>Original build artifacts</h2>
      <table>
        <thead>
          <tr>
            <th>File</th>
            <th>Bundle path</th>
            <th>Size</th>
          </tr>
        </thead>
        <tbody>
          ${artifactRows}
        </tbody>
      </table>
    </main>
  </body>
</html>`;

    await writeFile(path.join(pagesOutDir, 'index.html'), html);
    console.log(`Prepared standalone developer release page at ${pagesOutDir}`);
  } else {
    console.log(`Prepared developer release downloads at ${pagesOutDir}`);
  }
}

await main();
