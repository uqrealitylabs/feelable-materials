export type PointerUvEvent = {
  uv?: { x: number; y: number } | undefined;
  currentTarget?: { clientWidth?: number; clientHeight?: number } | undefined;
  nativeEvent?: { offsetX?: number; offsetY?: number } | undefined;
};

export function readPointerUv(event: PointerUvEvent) {
  if (event.uv) {
    return {
      x: clamp(event.uv.x, 0, 1),
      y: clamp(event.uv.y, 0, 1),
    };
  }

  const width = event.currentTarget?.clientWidth || 1;
  const height = event.currentTarget?.clientHeight || 1;

  return {
    x: clamp((event.nativeEvent?.offsetX ?? width / 2) / width, 0, 1),
    y: clamp(1 - (event.nativeEvent?.offsetY ?? height / 2) / height, 0, 1),
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
