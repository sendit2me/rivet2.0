import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import {
  extractInterpolationVariables,
  interpolate,
  replaceInterpolationTokens,
} from '../../src/utils/interpolation.js';

describe('interpolation utilities', () => {
  it('extracts valid variables while skipping a broken opener across lines', () => {
    const template = ['{{foo}}', '{{bar', '{{somevar}}'].join('\n');

    assert.deepStrictEqual(extractInterpolationVariables(template), ['foo', 'somevar']);
  });

  it('extracts valid variables while skipping a broken opener on one line', () => {
    const template = '{{foo}}  {{bar  {{somevar}}';

    assert.deepStrictEqual(extractInterpolationVariables(template), ['foo', 'somevar']);
  });

  it('keeps malformed interpolation text literal while still interpolating later valid tokens', () => {
    const template = '{{foo}}  {{bar  {{somevar}}';

    assert.equal(
      interpolate(template, {
        foo: { type: 'string', value: 'A' },
        somevar: { type: 'string', value: 'B' },
      }),
      'A  {{bar  B',
    );
  });

  it('preserves escaped tokens while interpolating normal ones', () => {
    const template = '{{{foo}}} {{bar}}';

    assert.equal(
      interpolate(template, {
        bar: { type: 'string', value: 'B' },
      }),
      '{{foo}} B',
    );
  });

  it('still recognizes later valid tokens that include processing syntax after malformed text', () => {
    const template = '{{foo | uppercase}} {{bar {{baz | lowercase}}';

    assert.equal(
      interpolate(template, {
        foo: { type: 'string', value: 'abc' },
        baz: { type: 'string', value: 'OK' },
      }),
      'ABC {{bar ok',
    );
  });

  it('replaces tokens through a caller-defined policy while preserving escaped tokens', () => {
    const template = '  {{{escaped}}} {{foo | ignored}} {{missing}}  ';

    assert.equal(
      replaceInterpolationTokens(
        template,
        ({ tokenName }) => {
          return tokenName === 'foo' ? 'BAR' : 'undefined';
        },
        { trim: true },
      ),
      '{{escaped}} BAR undefined',
    );
  });
});
