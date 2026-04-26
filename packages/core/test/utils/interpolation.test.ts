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

  it('dedupes repeated variables and ignores graph/context references during port discovery', () => {
    const template = [
      '{{foo}}',
      '{{foo | uppercase}}',
      '{{@graphInputs.shared}}',
      '{{@context.value}}',
      '{{bar}}',
    ].join('\n');

    assert.deepStrictEqual(extractInterpolationVariables(template), ['foo', 'bar']);
  });

  it('ignores empty and whitespace-only tokens during port discovery', () => {
    assert.deepStrictEqual(extractInterpolationVariables('{{}} {{   }} {{valid}}'), ['valid']);
  });

  it('applies processor chains after resolving graph and context references', () => {
    assert.equal(
      interpolate(
        '{{@graphInputs.name | uppercase}} {{@context.label | lowercase}}',
        {},
        {
          name: { type: 'string', value: 'Rivet' },
        },
        {
          label: { type: 'string', value: 'WORKFLOW' },
        },
      ),
      'RIVET workflow',
    );
  });

  it('handles escaped tokens adjacent to real tokens without merging them', () => {
    assert.equal(
      interpolate('{{{literal}}}{{real}}{{{again}}}', {
        real: { type: 'string', value: 'VALUE' },
      }),
      '{{literal}}VALUE{{again}}',
    );
  });

  it('does not throw while scanning malformed brace-heavy templates', () => {
    const templates = [
      '',
      '{',
      '}',
      '{{',
      '}}',
      '{{{',
      '}}}',
      '{{a',
      'a}}',
      '{{a}}{{',
      '{{a} } {{b}}',
      '{{a{{b}}',
      '{{{escaped}}} {{real}} {{broken',
      Array.from({ length: 40 }, (_, index) => (index % 3 === 0 ? '{{x}}' : '{')).join(''),
    ];

    for (const template of templates) {
      assert.doesNotThrow(() => extractInterpolationVariables(template), template);
      assert.doesNotThrow(
        () =>
          replaceInterpolationTokens(template, ({ tokenName }) => {
            return tokenName ?? '';
          }),
        template,
      );
    }
  });

  it('keeps repeated large templates to unique variables only', () => {
    const template = Array.from({ length: 250 }, (_, index) => `{{same}} {{value${index % 5}}}`).join(' ');

    assert.deepStrictEqual(extractInterpolationVariables(template), [
      'same',
      'value0',
      'value1',
      'value2',
      'value3',
      'value4',
    ]);
  });
});
