const isDev = typeof import.meta !== 'undefined' && !!import.meta.env?.DEV;

const counts = new Map<string, number>();
const marks = new Map<string, number>();

export function markCanvasPerfStart(name: string): void {
  if (!isDev) {
    return;
  }

  marks.set(name, performance.now());
}

export function markCanvasPerfEnd(name: string): void {
  if (!isDev) {
    return;
  }

  const start = marks.get(name);
  if (start == null) {
    return;
  }

  counts.set(`${name}:ms`, performance.now() - start);
}

export function countCanvasPerf(name: string, value = 1): void {
  if (!isDev) {
    return;
  }

  counts.set(name, (counts.get(name) ?? 0) + value);
}

export function setCanvasPerf(name: string, value: number): void {
  if (!isDev) {
    return;
  }

  counts.set(name, value);
}

export function getCanvasPerfSnapshot(): Array<{ name: string; value: number }> {
  if (!isDev) {
    return [];
  }

  return [...counts.entries()]
    .sort(([leftName], [rightName]) => leftName.localeCompare(rightName))
    .map(([name, value]) => ({ name, value }));
}
