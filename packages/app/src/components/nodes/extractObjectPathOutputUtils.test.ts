import assert from 'node:assert/strict';
import test from 'node:test';
import { ExtractObjectPathNodeImpl, type PortId } from '@rivet2/rivet-core';
import {
  getExtractObjectPathPreviewSource,
  getExtractObjectPathUsePathInput,
  getParsedExtractObjectPathPreviewSource,
  hasExtractObjectPathInterpolationInputs,
} from './extractObjectPathOutputUtils.js';

test('getExtractObjectPathPreviewSource prefers the stored execution snapshot over the current node path', () => {
  const node = {
    ...ExtractObjectPathNodeImpl.create(),
    data: {
      path: '$.current["{{field}}"]',
      usePathInput: false,
    },
  };

  const previewSource = getExtractObjectPathPreviewSource(node, {
    debugData: {
      extractObjectPathSource: '$.snapshot["{{field}}"]',
    },
  });

  assert.equal(previewSource, '$.snapshot["{{field}}"]');
});

test('getExtractObjectPathUsePathInput prefers the stored execution snapshot over the current node mode', () => {
  const node = {
    ...ExtractObjectPathNodeImpl.create(),
    data: {
      path: '$.current["{{field}}"]',
      usePathInput: false,
    },
  };

  assert.equal(
    getExtractObjectPathUsePathInput(node, {
      debugData: {
        extractObjectPathUsePathInput: true,
      },
    }),
    true,
  );
});

test('hasExtractObjectPathInterpolationInputs returns true only for interpolation-created ports', () => {
  assert.equal(hasExtractObjectPathInterpolationInputs('$.aaa["{{field}}"]'), true);
  assert.equal(hasExtractObjectPathInterpolationInputs('$.aaa.ccc'), false);
  assert.equal(hasExtractObjectPathInterpolationInputs('$.aaa["{{{field}}}"]'), false);
  assert.equal(hasExtractObjectPathInterpolationInputs('$.aaa["{{object}}"]'), false);
  assert.equal(hasExtractObjectPathInterpolationInputs('$.aaa["{{@context.field}}"]'), false);
  assert.equal(hasExtractObjectPathInterpolationInputs('{{broken + $.aaa["{{field}}"]'), true);
});

test('getParsedExtractObjectPathPreviewSource substitutes stored interpolation input values', () => {
  const parsedSource = getParsedExtractObjectPathPreviewSource('\n  $.aaa["{{field}}"][{{index}}]  \n', {
    ['field' as PortId]: {
      type: 'string',
      value: 'ccc',
    },
    ['index' as PortId]: {
      type: 'number',
      value: 1,
    },
  });

  assert.equal(parsedSource, '$.aaa["ccc"][1]');
});

test('getParsedExtractObjectPathPreviewSource leaves graph and context references visible without app-side context snapshots', () => {
  const parsedSource = getParsedExtractObjectPathPreviewSource('$.aaa["{{field}}"]["{{@context.leaf}}"]', {
    ['field' as PortId]: {
      type: 'string',
      value: 'ccc',
    },
  });

  assert.equal(parsedSource, '$.aaa["ccc"]["{{@context.leaf}}"]');
});
