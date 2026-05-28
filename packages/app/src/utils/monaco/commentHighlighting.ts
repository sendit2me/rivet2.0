import { monaco } from '../monaco.js';
import { findJsStyleCommentRanges, type JsStyleCommentRange } from './commentRangeScanner.js';

const JS_STYLE_COMMENT_CLASS_NAME = 'rivet-editor-js-style-comment';

function offsetRangeToMonacoRange(model: monaco.editor.ITextModel, range: JsStyleCommentRange): monaco.Range {
  const start = model.getPositionAt(range.start);
  const end = model.getPositionAt(range.end);

  return new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
}

export function installJsStyleCommentHighlighting(editor: monaco.editor.IStandaloneCodeEditor): monaco.IDisposable {
  const model = editor.getModel();

  if (!model) {
    return { dispose: () => {} };
  }

  const decorations = editor.createDecorationsCollection();

  const refresh = () => {
    decorations.set(
      findJsStyleCommentRanges(model.getValue()).map((range) => ({
        range: offsetRangeToMonacoRange(model, range),
        options: {
          inlineClassName: JS_STYLE_COMMENT_CLASS_NAME,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      })),
    );
  };

  const contentListener = model.onDidChangeContent(refresh);
  refresh();

  return {
    dispose: () => {
      decorations.clear();
      contentListener.dispose();
    },
  };
}
