import assert from 'node:assert/strict';
import test from 'node:test';
import type { NodeId } from '@rivet2/rivet-core';
import { toggleNodeSelection } from './nodeSelection.js';

const nodeId = (id: string) => id as NodeId;

test('toggleNodeSelection adds an unselected node', () => {
  assert.deepEqual(toggleNodeSelection([nodeId('a')], nodeId('b')), [nodeId('a'), nodeId('b')]);
});

test('toggleNodeSelection removes a selected node', () => {
  assert.deepEqual(toggleNodeSelection([nodeId('a'), nodeId('b'), nodeId('c')], nodeId('b')), [
    nodeId('a'),
    nodeId('c'),
  ]);
});

test('toggleNodeSelection removes duplicate selected ids defensively', () => {
  assert.deepEqual(toggleNodeSelection([nodeId('a'), nodeId('b'), nodeId('b')], nodeId('b')), [nodeId('a')]);
});
