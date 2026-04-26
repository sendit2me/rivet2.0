import test from 'node:test';
import assert from 'node:assert/strict';
import { canSaveProjectDataNoPrompt } from './projectSaveCapabilities.js';
import type { IOProvider } from '../io/IOProvider.js';

test('canSaveProjectDataNoPrompt preserves provider method receiver', () => {
  class StatefulProvider {
    #saveablePaths = new Set(['project.rivet-project']);

    async saveProjectDataNoPrompt() {}

    canSaveProjectDataNoPrompt(path: string) {
      return this.#saveablePaths.has(path);
    }
  }

  const provider = new StatefulProvider() as unknown as IOProvider;

  assert.equal(canSaveProjectDataNoPrompt(provider, 'project.rivet-project'), true);
  assert.equal(canSaveProjectDataNoPrompt(provider, 'other.rivet-project'), false);
});
