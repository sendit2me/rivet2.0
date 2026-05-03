import { isInTauri } from './core.js';
import { coerce, gt, valid } from 'semver';
import { getAppVersion } from './app.js';

const officialReleaseMetadataUrl = 'https://valerypopoff.github.io/rivet2.0/official-release.json';
const downloadPageUrl = 'https://valerypopoff.github.io/rivet2.0/download';

type ReleaseDownload = {
  label?: string;
  name?: string;
  originalPath?: string;
  url?: string;
  size?: number;
};

type PagesReleaseMetadata = {
  version?: string;
  generatedAt?: string;
  stableDownloads?: ReleaseDownload[];
  artifacts?: ReleaseDownload[];
};

type ReleasePlatform = 'windows' | 'macos' | 'linux' | 'unknown';

export type AppUpdateManifest = {
  body: string;
  downloadPageUrl: string;
  releaseMetadataUrl: string;
  version: string;
};

export type AppUpdateCheckResult = {
  currentVersion?: string;
  latestVersion?: string;
  manifest: AppUpdateManifest | null;
  shouldUpdate: boolean;
  unavailableReason?: string;
};

function normalizeVersion(version: string | undefined | null): string | null {
  if (!version) {
    return null;
  }

  return valid(version) ?? coerce(version)?.version ?? null;
}

function inferReleaseVersion(metadata: PagesReleaseMetadata): string | null {
  const explicitVersion = normalizeVersion(metadata.version);

  if (explicitVersion) {
    return explicitVersion;
  }

  const candidates = [...(metadata.stableDownloads ?? []), ...(metadata.artifacts ?? [])]
    .flatMap((item) => [item.name, item.originalPath])
    .filter((value): value is string => typeof value === 'string');

  for (const candidate of candidates) {
    const match = candidate.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/);
    const version = normalizeVersion(match?.[0]);

    if (version) {
      return version;
    }
  }

  return null;
}

function normalizeReleasePlatform(platform: string | undefined): ReleasePlatform {
  const normalizedPlatform = platform?.toLowerCase() ?? '';

  if (normalizedPlatform.includes('mac') || normalizedPlatform.includes('darwin')) {
    return 'macos';
  }

  if (normalizedPlatform.includes('win')) {
    return 'windows';
  }

  if (normalizedPlatform.includes('linux')) {
    return 'linux';
  }

  return 'unknown';
}

function getBrowserReleasePlatform(): ReleasePlatform {
  if (typeof navigator === 'undefined') {
    return 'unknown';
  }

  const userAgentDataPlatform =
    'userAgentData' in navigator && typeof navigator.userAgentData === 'object'
      ? (navigator.userAgentData as { platform?: string } | null)?.platform
      : undefined;

  return normalizeReleasePlatform(
    userAgentDataPlatform ?? navigator.platform ?? navigator.userAgent ?? undefined,
  );
}

function getReleaseDownloadsForPlatform(metadata: PagesReleaseMetadata, platform: ReleasePlatform): ReleaseDownload[] {
  const downloads = [...(metadata.stableDownloads ?? []), ...(metadata.artifacts ?? [])];

  if (platform === 'unknown') {
    return metadata.stableDownloads ?? [];
  }

  const platformPatterns: Record<Exclude<ReleasePlatform, 'unknown'>, RegExp> = {
    windows: /\.(exe|msi)$/i,
    macos: /\.(dmg|pkg)$/i,
    linux: /\.(AppImage|deb|rpm)$/i,
  };

  const pattern = platformPatterns[platform];
  return downloads.filter((download) => {
    const fileName = download.name ?? download.originalPath ?? download.url ?? '';
    return pattern.test(fileName);
  });
}

function formatUpdateBody(metadata: PagesReleaseMetadata, version: string): string {
  const generatedAt = metadata.generatedAt ? `\n\nRelease metadata generated at ${metadata.generatedAt}.` : '';
  return `Rivet ${version} is available.${generatedAt}\n\nOpen the Rivet 2 download page to get the installer for your operating system.`;
}

export function resolvePagesReleaseUpdate({
  currentVersion,
  metadata,
  platform,
}: {
  currentVersion: string;
  metadata: PagesReleaseMetadata;
  platform: string;
}): AppUpdateCheckResult {
  const normalizedCurrentVersion = normalizeVersion(currentVersion);
  const latestVersion = inferReleaseVersion(metadata);
  const releasePlatform = normalizeReleasePlatform(platform);

  if (!normalizedCurrentVersion) {
    return {
      manifest: null,
      shouldUpdate: false,
      unavailableReason: 'The current app version could not be read.',
    };
  }

  if (!latestVersion) {
    return {
      currentVersion: normalizedCurrentVersion,
      manifest: null,
      shouldUpdate: false,
      unavailableReason: 'Stable release metadata does not include a desktop app version yet.',
    };
  }

  const platformDownloads = getReleaseDownloadsForPlatform(metadata, releasePlatform);

  if (platformDownloads.length === 0) {
    return {
      currentVersion: normalizedCurrentVersion,
      latestVersion,
      manifest: null,
      shouldUpdate: false,
      unavailableReason: 'No stable desktop update is available for this operating system yet.',
    };
  }

  const shouldUpdate = gt(latestVersion, normalizedCurrentVersion);

  return {
    currentVersion: normalizedCurrentVersion,
    latestVersion,
    manifest: shouldUpdate
      ? {
          body: formatUpdateBody(metadata, latestVersion),
          downloadPageUrl,
          releaseMetadataUrl: officialReleaseMetadataUrl,
          version: latestVersion,
        }
      : null,
    shouldUpdate,
  };
}

export async function checkForAppUpdate(): Promise<{
  currentVersion?: string;
  latestVersion?: string;
  manifest?: AppUpdateManifest | null;
  shouldUpdate: boolean;
  unavailableReason?: string;
}> {
  if (!isInTauri()) {
    return { shouldUpdate: false, manifest: null };
  }

  const currentVersion = await getAppVersion();
  let response: Response;

  try {
    response = await fetch(officialReleaseMetadataUrl, { cache: 'no-store' });
  } catch (error) {
    console.warn('Could not fetch stable release metadata', error);
    return {
      currentVersion,
      manifest: null,
      shouldUpdate: false,
      unavailableReason: 'Could not reach the stable release feed.',
    };
  }

  if (response.status === 404) {
    return {
      currentVersion,
      manifest: null,
      shouldUpdate: false,
      unavailableReason: 'No stable release has been published yet.',
    };
  }

  if (!response.ok) {
    return {
      currentVersion,
      manifest: null,
      shouldUpdate: false,
      unavailableReason: `Could not read the stable release feed (${response.status} ${response.statusText}).`,
    };
  }

  let metadata: PagesReleaseMetadata;

  try {
    metadata = (await response.json()) as PagesReleaseMetadata;
  } catch (error) {
    console.warn('Stable release metadata is not valid JSON', error);
    return {
      currentVersion,
      manifest: null,
      shouldUpdate: false,
      unavailableReason: 'The stable release feed is not valid JSON.',
    };
  }

  return resolvePagesReleaseUpdate({
    currentVersion,
    metadata,
    platform: getBrowserReleasePlatform(),
  });
}
