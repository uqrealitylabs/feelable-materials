import { clamp } from "./numbers.js";

export type PointerUvEvent = {
  uv?: { x: number; y: number } | undefined;
  currentTarget?: { clientWidth?: number; clientHeight?: number } | undefined;
  nativeEvent?: { offsetX?: number; offsetY?: number } | undefined;
  pointerId?: number | undefined;
  stopPropagation?: (() => void) | undefined;
  target?:
    | {
        setPointerCapture?: ((pointerId: number) => void) | undefined;
        releasePointerCapture?: ((pointerId: number) => void) | undefined;
      }
    | undefined;
};

export function readPointerUv(event: PointerUvEvent) {
  if (event.uv) {
    return {
      x: clamp(event.uv.x, 0, 1, 0.5),
      y: clamp(event.uv.y, 0, 1, 0.5),
    };
  }

  const width = positiveSize(event.currentTarget?.clientWidth);
  const height = positiveSize(event.currentTarget?.clientHeight);
  if (!width || !height) return { x: 0.5, y: 0.5 };

  return {
    x: clamp((event.nativeEvent?.offsetX ?? width / 2) / width, 0, 1, 0.5),
    y: clamp(
      1 - (event.nativeEvent?.offsetY ?? height / 2) / height,
      0,
      1,
      0.5,
    ),
  };
}

function positiveSize(value: number | undefined) {
  return value && Number.isFinite(value) && value > 0 ? value : undefined;
}
