import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { assembleRegistry } from '../../src/index.js';
import type { PluginLoadSpec, RivetPlugin } from '../../src/index.js';

void describe('RegistryAssembly', () => {
  void it('continues past plugin load and registration failures', async () => {
    const specs: PluginLoadSpec[] = [
      { type: 'built-in', id: 'ok-1', name: 'OK 1' },
      { type: 'built-in', id: 'bad-load', name: 'Bad Load' },
      { type: 'built-in', id: 'bad-register', name: 'Bad Register' },
      { type: 'built-in', id: 'ok-2', name: 'OK 2' },
    ];

    const plugins: Record<string, RivetPlugin> = {
      'ok-1': { id: 'ok-1' },
      'bad-register': {
        id: 'bad-register',
        register() {
          throw new Error('register exploded');
        },
      },
      'ok-2': { id: 'ok-2' },
    };

    const { registry, results } = await assembleRegistry(specs, async (spec) => {
      if (spec.id === 'bad-load') {
        throw new Error('load exploded');
      }

      return plugins[spec.id]!;
    });

    assert.deepEqual(
      results.loaded.map((plugin) => plugin.id),
      ['ok-1', 'ok-2'],
    );
    assert.deepEqual(results.failed, [
      { id: 'bad-load', error: 'load exploded' },
      { id: 'bad-register', error: 'register exploded' },
    ]);
    assert.deepEqual(
      registry.getPlugins().map((plugin) => plugin.id),
      ['ok-1', 'ok-2'],
    );
  });
});
