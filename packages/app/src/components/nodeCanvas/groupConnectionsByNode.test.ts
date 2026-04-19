import assert from 'node:assert/strict';
import test from 'node:test';
import type { NodeConnection, NodeId, PortId } from '@ironclad/rivet-core';
import { groupConnectionsByNode } from './groupConnectionsByNode.js';

const asNodeId = (value: string) => value as NodeId;
const asPortId = (value: string) => value as PortId;

const connectionA = {
  inputId: asPortId('in-a'),
  inputNodeId: asNodeId('node-a'),
  outputId: asPortId('out-b'),
  outputNodeId: asNodeId('node-b'),
} satisfies NodeConnection;

const connectionB = {
  inputId: asPortId('in-c'),
  inputNodeId: asNodeId('node-c'),
  outputId: asPortId('out-b'),
  outputNodeId: asNodeId('node-b'),
} satisfies NodeConnection;

const selfLoopConnection = {
  inputId: asPortId('in-loop'),
  inputNodeId: asNodeId('node-loop'),
  outputId: asPortId('out-loop'),
  outputNodeId: asNodeId('node-loop'),
} satisfies NodeConnection;

test('groupConnectionsByNode groups each connection under both endpoints', () => {
  const grouped = groupConnectionsByNode([connectionA, connectionB]);

  assert.deepEqual(grouped[asNodeId('node-a')], [connectionA]);
  assert.deepEqual(grouped[asNodeId('node-b')], [connectionA, connectionB]);
  assert.deepEqual(grouped[asNodeId('node-c')], [connectionB]);
});

test('groupConnectionsByNode lets callers fall back to an empty array for unconnected nodes', () => {
  const grouped = groupConnectionsByNode([connectionA]);

  assert.equal(grouped[asNodeId('node-z')], undefined);
});

test('groupConnectionsByNode preserves original connection object identity', () => {
  const grouped = groupConnectionsByNode([connectionA]);

  assert.equal(grouped[asNodeId('node-a')]?.[0], connectionA);
  assert.equal(grouped[asNodeId('node-b')]?.[0], connectionA);
});

test('groupConnectionsByNode does not duplicate self-loop connections for the same node', () => {
  const grouped = groupConnectionsByNode([selfLoopConnection]);

  assert.deepEqual(grouped[asNodeId('node-loop')], [selfLoopConnection]);
});
