import assert from 'node:assert/strict';
import test from 'node:test';

import type { RivetPlugin } from '@valerypopoff/rivet2-core';

import { fillMissingSettingsFromEnvironmentVariables } from './tauri';

test('fillMissingSettingsFromEnvironmentVariables resolves independent env lookups concurrently', async () => {
  const requestedEnvVars: string[] = [];
  const resolveEnvVars = new Map<string, (value: string | undefined) => void>();

  const settingsPromise = fillMissingSettingsFromEnvironmentVariables(
    {},
    [
      {
        configSpec: {
          PLUGIN_KEY: { type: 'string', pullEnvironmentVariable: true },
          CUSTOM_CONFIG: { type: 'string', pullEnvironmentVariable: 'CUSTOM_ENV' },
          IGNORED_NUMBER: { type: 'number', pullEnvironmentVariable: 'IGNORED_ENV' },
        },
      } as unknown as RivetPlugin,
    ],
    {
      extraEnvVarNames: [' EXTRA_ENV ', '', 'PLUGIN_KEY'],
      environmentProvider: {
        getEnvVar(name) {
          requestedEnvVars.push(name);

          return new Promise((resolve) => {
            resolveEnvVars.set(name, resolve);
          });
        },
      },
    },
  );

  assert.deepEqual([...requestedEnvVars].sort(), [
    'CUSTOM_ENV',
    'EXTRA_ENV',
    'OPENAI_API_KEY',
    'OPENAI_ENDPOINT',
    'OPENAI_ORG_ID',
    'PLUGIN_KEY',
  ]);

  for (const envVarName of requestedEnvVars) {
    resolveEnvVars.get(envVarName)?.(
      envVarName === 'OPENAI_API_KEY'
        ? 'openai-key'
        : envVarName === 'CUSTOM_ENV'
          ? 'custom-value'
          : envVarName === 'EXTRA_ENV'
            ? 'extra-value'
            : undefined,
    );
  }

  const settings = await settingsPromise;

  assert.equal(settings.openAiKey, 'openai-key');
  assert.equal(settings.openAiOrganization, '');
  assert.equal(settings.openAiEndpoint, '');
  assert.deepEqual(settings.pluginEnv, {
    CUSTOM_ENV: 'custom-value',
    EXTRA_ENV: 'extra-value',
  });
});
