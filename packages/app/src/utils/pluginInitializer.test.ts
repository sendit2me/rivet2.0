import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolvePluginInitializer } from './pluginInitializer.js';

describe('resolvePluginInitializer', () => {
  it('returns a direct initializer function unchanged', () => {
    const initializer = (() => ({ id: 'direct' })) as any;

    assert.equal(resolvePluginInitializer(initializer, 'direct-plugin'), initializer);
  });

  it('unwraps a single default export wrapper', () => {
    const initializer = (() => ({ id: 'single-default' })) as any;

    assert.equal(resolvePluginInitializer({ default: initializer }, 'single-default-plugin'), initializer);
  });

  it('unwraps a double default export wrapper used by mixed CJS/ESM interop', () => {
    const initializer = (() => ({ id: 'double-default' })) as any;

    assert.equal(
      resolvePluginInitializer({ default: { default: initializer } }, 'double-default-plugin'),
      initializer,
    );
  });

  it('throws when the export does not resolve to a function', () => {
    assert.throws(
      () => resolvePluginInitializer({ default: { default: { nope: true } } }, 'bad-plugin'),
      /Plugin bad-plugin does not export a valid initializer function/,
    );
  });
});
