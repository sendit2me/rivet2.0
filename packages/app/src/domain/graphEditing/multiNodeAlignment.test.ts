import assert from 'node:assert/strict';
import test from 'node:test';
import type { NodeId } from '@rivet2/rivet-core';
import { calculateMultiNodeAlignmentMoves } from './multiNodeAlignment.js';

function makeBounds(
  nodeId: string,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  return {
    nodeId: nodeId as NodeId,
    x,
    y,
    width,
    height,
  };
}

test('align-left snaps every node to the left-most edge', () => {
  const moves = calculateMultiNodeAlignmentMoves(
    [
      makeBounds('a', 120, 40, 60, 40),
      makeBounds('b', 80, 140, 80, 40),
      makeBounds('c', 200, 240, 100, 40),
    ],
    'align-left',
  );

  assert.deepEqual(
    moves.map((move) => move.position.x),
    [80, 80, 80],
  );
});

test('align-center uses the shared selection center', () => {
  const moves = calculateMultiNodeAlignmentMoves(
    [
      makeBounds('a', 100, 40, 50, 30),
      makeBounds('b', 250, 120, 150, 30),
    ],
    'align-center',
  );

  assert.deepEqual(moves, [
    { nodeId: 'a' as NodeId, position: { x: 225, y: 40 } },
    { nodeId: 'b' as NodeId, position: { x: 175, y: 120 } },
  ]);
});

test('align-middle uses the shared vertical center', () => {
  const moves = calculateMultiNodeAlignmentMoves(
    [
      makeBounds('a', 0, 100, 40, 20),
      makeBounds('b', 80, 240, 40, 80),
    ],
    'align-middle',
  );

  assert.deepEqual(moves, [
    { nodeId: 'a' as NodeId, position: { x: 0, y: 200 } },
    { nodeId: 'b' as NodeId, position: { x: 80, y: 170 } },
  ]);
});

test('distribute-horizontally preserves outer bounds and equalizes gaps', () => {
  const moves = calculateMultiNodeAlignmentMoves(
    [
      makeBounds('a', 0, 20, 50, 40),
      makeBounds('b', 120, 30, 30, 40),
      makeBounds('c', 240, 40, 60, 40),
    ],
    'distribute-horizontally',
  );

  assert.deepEqual(moves, [
    { nodeId: 'a' as NodeId, position: { x: 0, y: 20 } },
    { nodeId: 'b' as NodeId, position: { x: 130, y: 30 } },
    { nodeId: 'c' as NodeId, position: { x: 240, y: 40 } },
  ]);
});

test('distribute-vertically preserves outer bounds and equalizes gaps', () => {
  const moves = calculateMultiNodeAlignmentMoves(
    [
      makeBounds('a', 20, 0, 50, 50),
      makeBounds('b', 30, 150, 50, 30),
      makeBounds('c', 40, 240, 50, 60),
    ],
    'distribute-vertically',
  );

  assert.deepEqual(moves, [
    { nodeId: 'a' as NodeId, position: { x: 20, y: 0 } },
    { nodeId: 'b' as NodeId, position: { x: 30, y: 130 } },
    { nodeId: 'c' as NodeId, position: { x: 40, y: 240 } },
  ]);
});
