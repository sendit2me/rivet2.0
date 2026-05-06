type Point = {
  x: number;
  y: number;
};

export type LineClipRect = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

const INSIDE = 0;
const LEFT = 1;
const RIGHT = 2;
const BOTTOM = 4;
const TOP = 8;

const computeOutCode = (x: number, y: number, clipRect: LineClipRect): number => {
  let code = INSIDE;

  if (x < clipRect.left) {
    code |= LEFT;
  } else if (x > clipRect.right) {
    code |= RIGHT;
  }

  if (y < clipRect.top) {
    code |= TOP;
  } else if (y > clipRect.bottom) {
    code |= BOTTOM;
  }

  return code;
};

export const lineCrossesViewport = (start: Point, end: Point, clipRect: LineClipRect): boolean => {
  let x0 = start.x;
  let y0 = start.y;
  let x1 = end.x;
  let y1 = end.y;

  let outcode0 = computeOutCode(x0, y0, clipRect);
  let outcode1 = computeOutCode(x1, y1, clipRect);
  let accept = false;

  while (true) {
    if (!(outcode0 | outcode1)) {
      accept = true;
      break;
    } else if (outcode0 & outcode1) {
      break;
    } else {
      let x, y;
      const outcodeOut = outcode0 ? outcode0 : outcode1;

      if (outcodeOut & TOP) {
        x = x0 + ((x1 - x0) * (clipRect.top - y0)) / (y1 - y0);
        y = clipRect.top;
      } else if (outcodeOut & BOTTOM) {
        x = x0 + ((x1 - x0) * (clipRect.bottom - y0)) / (y1 - y0);
        y = clipRect.bottom;
      } else if (outcodeOut & RIGHT) {
        y = y0 + ((y1 - y0) * (clipRect.right - x0)) / (x1 - x0);
        x = clipRect.right;
      } else {
        y = y0 + ((y1 - y0) * (clipRect.left - x0)) / (x1 - x0);
        x = clipRect.left;
      }

      if (outcodeOut === outcode0) {
        x0 = x;
        y0 = y;
        outcode0 = computeOutCode(x0, y0, clipRect);
      } else {
        x1 = x;
        y1 = y;
        outcode1 = computeOutCode(x1, y1, clipRect);
      }
    }
  }

  return accept;
};
