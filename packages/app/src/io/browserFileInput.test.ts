import assert from 'node:assert/strict';
import test from 'node:test';
import { BrowserIOProvider } from './BrowserIOProvider.js';
import { openBrowserFile } from './browserFileInput.js';

test('BrowserIOProvider support only depends on browser save picker support', () => {
  const originalWindow = globalThis.window;

  try {
    globalThis.window = {
      showSaveFilePicker: () => undefined,
    } as unknown as typeof window;

    assert.equal(BrowserIOProvider.isSupported(), true);

    globalThis.window = {} as typeof window;

    assert.equal(BrowserIOProvider.isSupported(), false);
  } finally {
    globalThis.window = originalWindow;
  }
});

test('openBrowserFile resolves the selected file from a standard file input', async () => {
  const originalDocument = globalThis.document;
  const selectedFile = { name: 'project.rivet-project' } as File;
  type FakeFileInput = {
    accept: string;
    click: () => void;
    files: File[];
    onchange: (() => void) | null;
    oncancel: (() => void) | null;
    remove: () => void;
    removed: boolean;
    style: { display: string };
    type: string;
  };
  const createdInputs: FakeFileInput[] = [];

  try {
    globalThis.document = {
      createElement: (tagName: string) => {
        assert.equal(tagName, 'input');

        const input: FakeFileInput = {
          accept: '',
          files: [selectedFile],
          onchange: null,
          oncancel: null,
          remove() {
            this.removed = true;
          },
          removed: false,
          style: { display: '' },
          type: '',
          click() {
            queueMicrotask(() => this.onchange?.());
          },
        };
        createdInputs.push(input);

        return input;
      },
      body: {
        appendChild: (input: FakeFileInput) => input,
      },
    } as unknown as Document;

    const file = await openBrowserFile({ accept: '.rivet-project' });
    const input = createdInputs[0];

    assert.equal(file, selectedFile);
    assert.ok(input);
    assert.equal(input.type, 'file');
    assert.equal(input.accept, '.rivet-project');
    assert.equal(input.style.display, 'none');
    assert.equal(input.removed, true);
  } finally {
    globalThis.document = originalDocument;
  }
});

test('openBrowserFile resolves undefined and cleans up when file selection is cancelled', async () => {
  const originalDocument = globalThis.document;
  let removed = false;

  try {
    globalThis.document = {
      createElement: () => {
        const input: {
          accept: string;
          click: () => void;
          files: File[];
          onchange: (() => void) | null;
          oncancel: (() => void) | null;
          remove: () => void;
          style: { display: string };
          type: string;
        } = {
          accept: '',
          click() {
            queueMicrotask(() => input.oncancel?.());
          },
          files: [],
          onchange: null,
          oncancel: null,
          remove() {
            removed = true;
          },
          style: { display: '' },
          type: '',
        };

        return input as unknown as HTMLInputElement;
      },
      body: {
        appendChild: (input: HTMLInputElement) => input,
      },
    } as unknown as Document;

    const file = await openBrowserFile();

    assert.equal(file, undefined);
    assert.equal(removed, true);
  } finally {
    globalThis.document = originalDocument;
  }
});
