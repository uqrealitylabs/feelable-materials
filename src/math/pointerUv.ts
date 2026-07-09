export type PointerUvEvent = {
  uv?: { x: number; y: number } | undefined;
};

export function readPointerUv(event: PointerUvEvent) {
  if (event.uv) {
    return {
      x: clamp(event.uv.x, 0, 1),
      y: clamp(event.uv.y, 0, 1),
    };
  }

  return { x: 0.5, y: 0.5 };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
