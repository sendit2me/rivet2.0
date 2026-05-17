import { monaco } from '../monaco.js';
import {
  type EditorInterpolationSyntax,
  getActiveInterpolationOffsetRanges,
  JSON_TEMPLATE_INTERPOLATION_MARKER_OWNERS,
  JS_VALUE_INTERPOLATION_MARKER_OWNERS,
  shouldSuppressMarkerForInterpolation,
  type OffsetRange,
} from './interpolationDiagnostics.js';

const INTERPOLATION_TOKEN_CLASS_NAME = 'rivet-editor-interpolation-token';
const INTERPOLATION_MARKER_OWNERS_BY_SYNTAX = {
  'js-value': JS_VALUE_INTERPOLATION_MARKER_OWNERS,
  'json-template': JSON_TEMPLATE_INTERPOLATION_MARKER_OWNERS,
} as const satisfies Record<EditorInterpolationSyntax, readonly string[]>;

function offsetRangeToMonacoRange(model: monaco.editor.ITextModel, range: OffsetRange): monaco.Range {
  const start = model.getPositionAt(range.start);
  const end = model.getPositionAt(range.end);

  return new monaco.Range(start.lineNumber, start.column, end.lineNumber, end.column);
}

function markerToOffsetRange(model: monaco.editor.ITextModel, marker: monaco.editor.IMarker): OffsetRange {
  const start = model.getOffsetAt({
    lineNumber: marker.startLineNumber,
    column: marker.startColumn,
  });
  const end = model.getOffsetAt({
    lineNumber: marker.endLineNumber,
    column: marker.endColumn,
  });

  return { start, end };
}

function markerToMarkerData(marker: monaco.editor.IMarker): monaco.editor.IMarkerData {
  return {
    code: marker.code,
    severity: marker.severity,
    message: marker.message,
    source: marker.source,
    startLineNumber: marker.startLineNumber,
    startColumn: marker.startColumn,
    endLineNumber: marker.endLineNumber,
    endColumn: marker.endColumn,
    modelVersionId: marker.modelVersionId,
    relatedInformation: marker.relatedInformation,
    tags: marker.tags,
  };
}

export function installEditorInterpolationSupport(
  editor: monaco.editor.IStandaloneCodeEditor,
  syntax: EditorInterpolationSyntax,
): monaco.IDisposable {
  const model = editor.getModel();

  if (!model) {
    return { dispose: () => {} };
  }

  const decorations = editor.createDecorationsCollection();
  const disposables: monaco.IDisposable[] = [];
  let disposed = false;

  const getInterpolationRanges = () => getActiveInterpolationOffsetRanges(model.getValue());

  const updateDecorations = () => {
    const interpolationRanges = getInterpolationRanges();

    decorations.set(
      interpolationRanges.map((range) => ({
        range: offsetRangeToMonacoRange(model, range),
        options: {
          inlineClassName: INTERPOLATION_TOKEN_CLASS_NAME,
          stickiness: monaco.editor.TrackedRangeStickiness.NeverGrowsWhenTypingAtEdges,
        },
      })),
    );
  };

  const filterMarkers = () => {
    if (disposed || editor.getModel() !== model) {
      return;
    }

    const interpolationRanges = getInterpolationRanges();

    if (interpolationRanges.length === 0) {
      return;
    }

    for (const owner of INTERPOLATION_MARKER_OWNERS_BY_SYNTAX[syntax]) {
      const markers = monaco.editor.getModelMarkers({
        owner,
        resource: model.uri,
      });
      const filteredMarkers = markers.filter(
        (marker) => !shouldSuppressMarkerForInterpolation(markerToOffsetRange(model, marker), interpolationRanges),
      );

      if (filteredMarkers.length !== markers.length) {
        monaco.editor.setModelMarkers(model, owner, filteredMarkers.map(markerToMarkerData));
      }
    }
  };

  const refresh = () => {
    if (disposed || editor.getModel() !== model) {
      return;
    }

    updateDecorations();
    filterMarkers();
  };

  disposables.push(model.onDidChangeContent(refresh));
  disposables.push(
    monaco.editor.onDidChangeMarkers((resources) => {
      if (resources.some((resource) => resource.toString() === model.uri.toString())) {
        filterMarkers();
      }
    }),
  );

  refresh();

  return {
    dispose: () => {
      disposed = true;
      decorations.clear();
      disposables.forEach((disposable) => disposable.dispose());
    },
  };
}
