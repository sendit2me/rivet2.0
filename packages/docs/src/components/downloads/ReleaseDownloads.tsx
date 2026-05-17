import React, { useEffect, useState } from 'react';
import useBaseUrl from '@docusaurus/useBaseUrl';

import styles from './ReleaseDownloads.module.css';

type ReleaseDownload = {
  label: string;
  name: string;
  platform?: string;
  url: string;
  size: number;
};

type ReleaseArtifact = {
  name: string;
  originalPath: string;
  platform?: string;
  url: string;
  size: number;
};

type ReleaseMetadata = {
  channel?: string;
  title?: string;
  label: string;
  generatedAt: string;
  branch: string;
  commit: string;
  runUrl: string | null;
  commitUrl: string | null;
  stableDownloads?: ReleaseDownload[];
  artifacts?: ReleaseArtifact[];
};

function formatBytes(bytes: number) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

function releaseDateLabel(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

type ReleaseDownloadsProps = {
  emptyDownloadsMessage: string;
  emptyMetadataMessage: string;
  loadingMessage: string;
  metadataFile: string;
};

function ReleaseDownloads({
  emptyDownloadsMessage,
  emptyMetadataMessage,
  loadingMessage,
  metadataFile,
}: ReleaseDownloadsProps) {
  const metadataUrl = useBaseUrl(`/${metadataFile}`);
  const siteRoot = useBaseUrl('/');
  const [metadata, setMetadata] = useState<ReleaseMetadata | null>(null);
  const [didLoad, setDidLoad] = useState(false);

  const toSiteUrl = (url: string) =>
    /^https?:\/\//i.test(url) ? url : `${siteRoot.replace(/\/$/, '')}/${url.replace(/^\//, '')}`;

  useEffect(() => {
    const controller = new AbortController();

    fetch(metadataUrl, {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!controller.signal.aborted) {
          setMetadata(data);
          setDidLoad(true);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setDidLoad(true);
        }
      });

    return () => {
      controller.abort();
    };
  }, [metadataUrl]);

  if (!didLoad) {
    return <p className={styles.empty}>{loadingMessage}</p>;
  }

  if (!metadata) {
    return (
      <div className={styles.releaseCard}>
        <p className={styles.empty}>{emptyMetadataMessage}</p>
      </div>
    );
  }

  const stableDownloads = metadata.stableDownloads ?? [];
  const artifacts = metadata.artifacts ?? [];

  return (
    <div className={styles.releaseCard}>
      <p className={styles.meta}>
        Branch: {metadata.branch} | Commit:{' '}
        {metadata.commitUrl ? (
          <a href={metadata.commitUrl}>{metadata.commit.slice(0, 7)}</a>
        ) : (
          metadata.commit.slice(0, 7)
        )}{' '}
        | Build: {metadata.runUrl ? <a href={metadata.runUrl}>{metadata.label}</a> : metadata.label} | Generated:{' '}
        {releaseDateLabel(metadata.generatedAt)}
      </p>

      {stableDownloads.length > 0 ? (
        <div className={styles.downloads}>
          {stableDownloads.map((download) => (
            <a className={styles.downloadLink} href={toSiteUrl(download.url)} key={download.name}>
              <span className={styles.downloadLabel}>{download.label}</span>
              <span className={styles.downloadName}>
                {download.name} - {formatBytes(download.size)}
              </span>
            </a>
          ))}
        </div>
      ) : (
        <p className={styles.empty}>{emptyDownloadsMessage}</p>
      )}

      {artifacts.length > 0 && (
        <>
          <h3>Original Build Artifacts</h3>
          <table className={styles.artifactTable}>
            <thead>
              <tr>
                <th>File</th>
                <th>Bundle path</th>
                <th>Size</th>
              </tr>
            </thead>
            <tbody>
              {artifacts.map((artifact) => (
                <tr key={artifact.url}>
                  <td>
                    <a href={toSiteUrl(artifact.url)}>{artifact.name}</a>
                  </td>
                  <td>{artifact.originalPath}</td>
                  <td>{formatBytes(artifact.size)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
}

export function StableReleaseDownloads() {
  return (
    <ReleaseDownloads
      metadataFile="official-release.json"
      loadingMessage="Loading stable release information..."
      emptyMetadataMessage="Stable release metadata is not available yet. On GitHub Pages, this section is populated by the latest successful main-branch desktop build."
      emptyDownloadsMessage="No stable desktop download aliases were produced for this build."
    />
  );
}

export function DeveloperReleaseDownloads() {
  return (
    <ReleaseDownloads
      metadataFile="developer-release.json"
      loadingMessage="Loading developer release information..."
      emptyMetadataMessage="Developer release metadata is not available in this local documentation build. On GitHub Pages, this section is populated by the latest successful develop-branch desktop build."
      emptyDownloadsMessage="No developer desktop download aliases were produced for this build."
    />
  );
}
