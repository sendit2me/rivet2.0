import assert from 'node:assert/strict';
import test from 'node:test';
import { resolvePagesReleaseUpdate } from './updater';

test('resolvePagesReleaseUpdate reports a newer stable Windows release', () => {
  const result = resolvePagesReleaseUpdate({
    currentVersion: '2.0.0',
    platform: 'win32',
    metadata: {
      version: '2.0.1',
      stableDownloads: [
        {
          name: 'Rivet-2-Windows-Setup.exe',
          url: 'downloads/official/Rivet-2-Windows-Setup.exe',
        },
      ],
    },
  });

  assert.equal(result.shouldUpdate, true);
  assert.equal(result.manifest?.version, '2.0.1');
  assert.equal(result.manifest?.downloadPageUrl, 'https://valerypopoff.github.io/rivet2.0/download');
});

test('resolvePagesReleaseUpdate treats the current version as up to date', () => {
  const result = resolvePagesReleaseUpdate({
    currentVersion: '2.0.1',
    platform: 'win32',
    metadata: {
      version: '2.0.1',
      stableDownloads: [
        {
          name: 'Rivet-2-Windows-Setup.exe',
          url: 'downloads/official/Rivet-2-Windows-Setup.exe',
        },
      ],
    },
  });

  assert.equal(result.shouldUpdate, false);
  assert.equal(result.manifest, null);
});

test('resolvePagesReleaseUpdate ignores releases for other operating systems', () => {
  const result = resolvePagesReleaseUpdate({
    currentVersion: '2.0.0',
    platform: 'darwin',
    metadata: {
      version: '2.0.1',
      stableDownloads: [
        {
          name: 'Rivet-2-Windows-Setup.exe',
          url: 'downloads/official/Rivet-2-Windows-Setup.exe',
        },
      ],
    },
  });

  assert.equal(result.shouldUpdate, false);
  assert.equal(result.manifest, null);
  assert.equal(result.unavailableReason, 'No stable desktop update is available for this operating system yet.');
});

test('resolvePagesReleaseUpdate can infer the version from original artifact names', () => {
  const result = resolvePagesReleaseUpdate({
    currentVersion: '2.0.0',
    platform: 'win32',
    metadata: {
      artifacts: [
        {
          name: 'Rivet_2.0.2_x64-setup.exe',
          originalPath: 'nsis/Rivet_2.0.2_x64-setup.exe',
          url: 'downloads/official/original/nsis/Rivet_2.0.2_x64-setup.exe',
        },
      ],
    },
  });

  assert.equal(result.shouldUpdate, true);
  assert.equal(result.manifest?.version, '2.0.2');
});
