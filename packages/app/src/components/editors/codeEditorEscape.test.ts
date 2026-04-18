import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { type monaco } from '../../utils/monaco.js';
import { handleCodeEditorEscape } from './codeEditorEscape.js';

function createEditorWithSuggestController(suggestController?: unknown): monaco.editor.IStandaloneCodeEditor {
  return {
    getContribution: (id: string) => {
      assert.equal(id, 'editor.contrib.suggestController');
      return suggestController;
    },
  } as monaco.editor.IStandaloneCodeEditor;
}

describe('codeEditorEscape', () => {
  test('dismisses the suggest widget when it is active', () => {
    let didCancelSuggestWidget = false;
    let didClosePanel = false;

    const result = handleCodeEditorEscape({
      editor: createEditorWithSuggestController({
        cancelSuggestWidget: () => {
          didCancelSuggestWidget = true;
        },
        widget: {
          isInitialized: true,
          value: { _state: 3 },
        },
      }),
      onClose: () => {
        didClosePanel = true;
      },
    });

    assert.equal(result, 'dismissed-suggest');
    assert.equal(didCancelSuggestWidget, true);
    assert.equal(didClosePanel, false);
  });

  test('closes the panel when the suggest widget is hidden', () => {
    let didCancelSuggestWidget = false;
    let didClosePanel = false;

    const result = handleCodeEditorEscape({
      editor: createEditorWithSuggestController({
        cancelSuggestWidget: () => {
          didCancelSuggestWidget = true;
        },
        widget: {
          isInitialized: true,
          value: { _state: 0 },
        },
      }),
      onClose: () => {
        didClosePanel = true;
      },
    });

    assert.equal(result, 'closed-panel');
    assert.equal(didCancelSuggestWidget, false);
    assert.equal(didClosePanel, true);
  });

  test('closes the panel when the suggest widget is uninitialized', () => {
    let didClosePanel = false;

    const result = handleCodeEditorEscape({
      editor: createEditorWithSuggestController({
        widget: {
          isInitialized: false,
          value: { _state: 3 },
        },
      }),
      onClose: () => {
        didClosePanel = true;
      },
    });

    assert.equal(result, 'closed-panel');
    assert.equal(didClosePanel, true);
  });

  test('closes the panel when no suggest controller exists', () => {
    let didClosePanel = false;

    const result = handleCodeEditorEscape({
      editor: createEditorWithSuggestController(undefined),
      onClose: () => {
        didClosePanel = true;
      },
    });

    assert.equal(result, 'closed-panel');
    assert.equal(didClosePanel, true);
  });

  test('returns noop when there is no active suggest widget and no close handler', () => {
    const result = handleCodeEditorEscape({
      editor: createEditorWithSuggestController({
        widget: {
          isInitialized: true,
          value: { _state: 0 },
        },
      }),
    });

    assert.equal(result, 'noop');
  });

  test('dismisses the suggest widget even when no close handler is provided', () => {
    let didCancelSuggestWidget = false;

    const result = handleCodeEditorEscape({
      editor: createEditorWithSuggestController({
        cancelSuggestWidget: () => {
          didCancelSuggestWidget = true;
        },
        widget: {
          isInitialized: true,
          value: { _state: 1 },
        },
      }),
    });

    assert.equal(result, 'dismissed-suggest');
    assert.equal(didCancelSuggestWidget, true);
  });
});
