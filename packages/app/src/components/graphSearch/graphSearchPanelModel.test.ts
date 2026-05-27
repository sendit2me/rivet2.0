import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getGraphSearchPanelMaxHeight, getNextGraphSearchPanelHeight } from './graphSearchPanelModel';

void describe('graphSearchPanelModel', () => {
  void it('calculates max height from viewport, panel top, and bottom margin', () => {
    assert.equal(
      getGraphSearchPanelMaxHeight({
        bottomMargin: 16,
        minHeight: 180,
        panelTop: 100,
        viewportHeight: 800,
      }),
      684,
    );
  });

  void it('never returns a max height below the minimum height', () => {
    assert.equal(
      getGraphSearchPanelMaxHeight({
        bottomMargin: 16,
        minHeight: 180,
        panelTop: 760,
        viewportHeight: 800,
      }),
      180,
    );
  });

  void it('clamps resize movement between the minimum and maximum height', () => {
    const base = {
      maxHeight: 500,
      minHeight: 180,
      startHeight: 300,
      startY: 100,
    };

    assert.equal(getNextGraphSearchPanelHeight({ ...base, pointerY: 50 }), 250);
    assert.equal(getNextGraphSearchPanelHeight({ ...base, pointerY: -200 }), 180);
    assert.equal(getNextGraphSearchPanelHeight({ ...base, pointerY: 600 }), 500);
  });
});
