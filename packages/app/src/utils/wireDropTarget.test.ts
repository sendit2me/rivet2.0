import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveClosestWireDropTargetFromPoint } from './wireDropTarget.js';

test('resolveClosestWireDropTargetFromPoint returns the nearest valid hover target', () => {
  const originalDocument = globalThis.document;
  const originalHTMLElement = globalThis.HTMLElement;

  class FakeElement {
    parentElement: FakeElement | null = null;
    dataset: Record<string, string> = {};
    classList = {
      contains: (className: string) => this.classNames.has(className),
    };

    constructor(
      private readonly classNames: Set<string>,
      private readonly rect: { x: number; y: number; width: number; height: number },
    ) {}

    getBoundingClientRect() {
      return this.rect;
    }
  }

  try {
    (globalThis as any).HTMLElement = FakeElement;
    (globalThis as any).document = {
      elementsFromPoint: () => {
        const nearerPort = new FakeElement(new Set(), { x: 0, y: 0, width: 20, height: 20 });
        nearerPort.dataset.nodeid = 'node-b';
        nearerPort.dataset.portid = 'port-b';

        const nearerHover = new FakeElement(new Set(['port-hover-area']), { x: 5, y: 5, width: 10, height: 10 });
        nearerHover.parentElement = nearerPort;

        const fartherPort = new FakeElement(new Set(), { x: 0, y: 0, width: 20, height: 20 });
        fartherPort.dataset.nodeid = 'node-a';
        fartherPort.dataset.portid = 'port-a';

        const fartherHover = new FakeElement(new Set(['port-hover-area']), { x: 40, y: 40, width: 10, height: 10 });
        fartherHover.parentElement = fartherPort;

        return [fartherHover, nearerHover] as unknown as Element[];
      },
    } as unknown as Document;

    const target = resolveClosestWireDropTargetFromPoint({
      clientX: 10,
      clientY: 10,
      getInputDefinition: (nodeId, portId) => ({
        id: portId,
        title: `${nodeId}-${portId}`,
        dataType: 'string',
      }) as any,
    });

    assert.equal(target?.nodeId, 'node-b');
    assert.equal(target?.portId, 'port-b');
  } finally {
    (globalThis as any).document = originalDocument;
    (globalThis as any).HTMLElement = originalHTMLElement;
  }
});

test('resolveClosestWireDropTargetFromPoint returns undefined when no valid hovered input exists', () => {
  const originalDocument = globalThis.document;
  const originalHTMLElement = globalThis.HTMLElement;

  class FakeElement {
    parentElement: FakeElement | null = null;
    dataset: Record<string, string> = {};
    classList = {
      contains: (className: string) => this.classNames.has(className),
    };

    constructor(
      private readonly classNames: Set<string>,
      private readonly rect: { x: number; y: number; width: number; height: number },
    ) {}

    getBoundingClientRect() {
      return this.rect;
    }
  }

  try {
    (globalThis as any).HTMLElement = FakeElement;
    (globalThis as any).document = {
      elementsFromPoint: () => [new FakeElement(new Set(), { x: 0, y: 0, width: 20, height: 20 })] as unknown as Element[],
    } as unknown as Document;

    const target = resolveClosestWireDropTargetFromPoint({
      clientX: 10,
      clientY: 10,
      getInputDefinition: () => undefined,
    });

    assert.equal(target, undefined);
  } finally {
    (globalThis as any).document = originalDocument;
    (globalThis as any).HTMLElement = originalHTMLElement;
  }
});
