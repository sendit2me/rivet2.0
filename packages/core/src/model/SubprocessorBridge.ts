import type Emittery from 'emittery';
import type { GraphProcessor, ProcessEvents } from './GraphProcessor.js';

export function wireSubprocessorEvents(
  processor: GraphProcessor,
  parentEmitter: Emittery<ProcessEvents>,
  parentState: {
    isPaused: () => boolean;
    pause: () => void;
    resume: () => void;
  },
): void {
  const unsubscribers = [
    processor.on('nodeError', (event) => parentEmitter.emit('nodeError', event)),
    processor.on('nodeFinish', (event) => parentEmitter.emit('nodeFinish', event)),
    processor.on('partialOutput', (event) => parentEmitter.emit('partialOutput', event)),
    processor.on('nodeExcluded', (event) => parentEmitter.emit('nodeExcluded', event)),
    processor.on('nodeStart', (event) => parentEmitter.emit('nodeStart', event)),
    processor.on('graphAbort', (event) => parentEmitter.emit('graphAbort', event)),
    processor.on('userInput', (event) => parentEmitter.emit('userInput', event)),
    processor.on('graphStart', (event) => parentEmitter.emit('graphStart', event)),
    processor.on('graphFinish', (event) => parentEmitter.emit('graphFinish', event)),
    processor.on('globalSet', (event) => parentEmitter.emit('globalSet', event)),
    processor.on('newAbortController', (event) => parentEmitter.emit('newAbortController', event)),
    processor.on('pause', () => {
      if (!parentState.isPaused()) {
        parentState.pause();
      }
    }),
    processor.on('resume', () => {
      if (parentState.isPaused()) {
        parentState.resume();
      }
    }),
  ];

  const unsubscribeAny = processor.onAny((event, data) => {
    if (event.startsWith('globalSet:')) {
      void parentEmitter.emit(event, data);
    }
  });

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    unsubscribers.forEach((unsubscribe) => unsubscribe());
    unsubscribeAny();
    unsubscribeGraphFinish();
    unsubscribeGraphAbort();
    unsubscribeGraphError();
  };

  const unsubscribeGraphFinish = processor.on('graphFinish', cleanup);
  const unsubscribeGraphAbort = processor.on('graphAbort', cleanup);
  const unsubscribeGraphError = processor.on('graphError', cleanup);
}

export function wireSubprocessorLifecycle(
  processor: GraphProcessor,
  options: {
    signal?: AbortSignal;
    parentAbortSignal: AbortSignal;
    onParentPause: (listener: () => void) => () => void;
    onParentResume: (listener: () => void) => () => void;
  },
): void {
  const abortFromSignal = () => {
    void processor.abort();
  };
  const abortFromParent = () => {
    void processor.abort();
  };
  const pauseProcessor = () => {
    void processor.pause();
  };
  const resumeProcessor = () => {
    void processor.resume();
  };

  options.signal?.addEventListener('abort', abortFromSignal, { once: true });
  options.parentAbortSignal.addEventListener('abort', abortFromParent, { once: true });

  const unsubscribeParentPause = options.onParentPause(pauseProcessor);
  const unsubscribeParentResume = options.onParentResume(resumeProcessor);

  let cleanedUp = false;
  const cleanup = () => {
    if (cleanedUp) {
      return;
    }

    cleanedUp = true;
    options.signal?.removeEventListener('abort', abortFromSignal);
    options.parentAbortSignal.removeEventListener('abort', abortFromParent);
    unsubscribeParentPause();
    unsubscribeParentResume();
    unsubscribeGraphFinish();
    unsubscribeGraphAbort();
    unsubscribeGraphError();
  };

  const unsubscribeGraphFinish = processor.on('graphFinish', cleanup);
  const unsubscribeGraphAbort = processor.on('graphAbort', cleanup);
  const unsubscribeGraphError = processor.on('graphError', cleanup);
}
