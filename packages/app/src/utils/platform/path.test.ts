import assert from 'node:assert/strict';
import test from 'node:test';
import { getPathDirname } from './path.js';

test('getPathDirname returns parent directory for Windows project paths', () => {
  assert.equal(getPathDirname('D:\\Programming\\Rivet2.0\\example.rivet-project'), 'D:\\Programming\\Rivet2.0');
});

test('getPathDirname returns parent directory for POSIX project paths', () => {
  assert.equal(getPathDirname('/Users/example/Rivet2.0/example.rivet-project'), '/Users/example/Rivet2.0');
});

test('getPathDirname preserves root directories', () => {
  assert.equal(getPathDirname('C:\\example.rivet-project'), 'C:\\');
  assert.equal(getPathDirname('/example.rivet-project'), '/');
});
