import { describe, expect, it } from "vitest";
import {
  type Cloth,
  type ClothContact,
  clothIsMoving,
  createCloth,
  stepCloth,
} from "../../examples/demo/src/cloth";

const run = (hz: number, seconds: number, contact?: ClothContact) => {
  const cloth = createCloth(4, 3, 8, 6);
  for (let frame = 0; frame < hz * seconds; frame += 1)
    stepCloth(cloth, 1 / hz, contact);
  return cloth;
};

const drag = (hz: number) => {
  const cloth = createCloth(4, 3, 8, 6);
  stepCloth(cloth, 1 / 120, { x: 0.35, y: 0.5, pressure: 1 });
  for (let frame = 0; frame < hz; frame += 1) {
    stepCloth(cloth, 1 / hz, {
      x: 0.35 + (0.3 * (frame + 1)) / hz,
      y: 0.5,
      pressure: 1,
    });
  }
  return cloth;
};

const metrics = (
  values: Float32Array,
  baseline: Float32Array,
  stride = 1,
  offset = stride - 1,
) => {
  let minimum = Number.POSITIVE_INFINITY;
  let peak = 0;
  let energy = 0;
  for (let index = offset; index < values.length; index += stride) {
    const difference = (values[index] ?? 0) - (baseline[index] ?? 0);
    minimum = Math.min(minimum, difference);
    peak = Math.max(peak, Math.abs(difference));
    energy += difference ** 2;
  }
  return [minimum, peak, Math.sqrt((energy * stride) / values.length)] as const;
};

const maxConstraintStretch = ({ links, positions }: Cloth) => {
  let stretch = 0;
  for (let link = 0; link < links.length; link += 4) {
    const a = (links[link] ?? 0) * 3;
    const b = (links[link + 1] ?? 0) * 3;
    const distance = Math.hypot(
      (positions[a] ?? 0) - (positions[b] ?? 0),
      (positions[a + 1] ?? 0) - (positions[b + 1] ?? 0),
      (positions[a + 2] ?? 0) - (positions[b + 2] ?? 0),
    );
    stretch = Math.max(
      stretch,
      Math.abs(distance / (links[link + 2] ?? distance) - 1),
    );
  }
  return stretch;
};

describe("demo cloth solver", () => {
  it.each([
    [Number.NaN, -1, 6.4, 4],
    [1e308, Number.MIN_VALUE, 64, 0.01],
  ])(
    "bounds dimensions %s × %s",
    (width, height, expectedWidth, expectedHeight) => {
      const fallback = createCloth(width, height, Number.POSITIVE_INFINITY, 0);
      expect([
        fallback.width,
        fallback.height,
        fallback.columns,
        fallback.rows,
      ]).toEqual([expectedWidth, expectedHeight, 24, 2]);
      expect(fallback.positions.every(Number.isFinite)).toBe(true);
    },
  );

  it("pins the top boundary and builds structural, shear, and bend links", () => {
    const cloth = run(60, 2, { x: 0.5, y: 0.8, pressure: 1 });
    const { columns } = cloth;
    expect(cloth.links.length / 4).toBe(300);
    expect(
      cloth.rest.some((value, index) => index % 3 === 2 && value > 0.1),
    ).toBe(true);
    expect(cloth.positions.slice(0, (columns + 1) * 3)).toEqual(
      cloth.rest.slice(0, (columns + 1) * 3),
    );
  });

  it.each([
    [16, 10],
    [20, 12],
    [28, 18],
  ])("keeps %i × %i constraints below 3%% stretch", (columns, rows) => {
    const cloth = createCloth(6.4, 4, columns, rows);
    for (let frame = 0; frame < 120; frame += 1)
      stepCloth(cloth, 1 / 120, { x: 0.5, y: 0.5, pressure: 1 });
    expect(maxConstraintStretch(cloth)).toBeLessThan(0.03);
  });

  it.each([
    [16, 10],
    [20, 12],
    [28, 18],
  ])("settles the initial %i × %i drape without contact", (columns, rows) => {
    const cloth = createCloth(6.4, 4, columns, rows);
    const initial = cloth.positions.slice();
    expect(stepCloth(cloth, 1 / 120)).toBe(1);
    expect(clothIsMoving(cloth)).toBe(true);
    for (let frame = 1; frame < 120; frame += 1) stepCloth(cloth, 1 / 120);
    expect(metrics(cloth.positions, initial)[1]).toBeGreaterThan(0.0001);
    expect(maxConstraintStretch(cloth)).toBeLessThan(0.03);
  });

  it.each([30, 60, 120, 144, 240])("is fixed-step stable at %i Hz", (hz) => {
    const actual = run(hz, 2, { x: 0.45, y: 0.45, pressure: 0.8 });
    const expected = run(120, 2, { x: 0.45, y: 0.45, pressure: 0.8 });
    expect(actual.positions).toEqual(expected.positions);
  });

  it.each([30, 60, 120])(
    "propagates contact past its radius at %i Hz",
    (hz) => {
      const pressed = run(hz, 1, { x: 0.5, y: 0.5, pressure: 1 });
      const control = run(hz, 1);
      let outsideMotion = 0;
      for (let index = 0; index < pressed.rest.length; index += 3)
        if (
          Math.hypot(pressed.rest[index], pressed.rest[index + 1]) >
          3 * 0.22 * 1.2
        )
          outsideMotion = Math.max(
            outsideMotion,
            Math.hypot(
              pressed.positions[index] - control.positions[index],
              pressed.positions[index + 1] - control.positions[index + 1],
              pressed.positions[index + 2] - control.positions[index + 2],
            ),
          );
      expect(outsideMotion).toBeGreaterThan(0.01);
    },
  );

  it.each([30, 60, 120, 144, 240])(
    "transfers drag direction at %i Hz",
    (hz) => {
      const dragged = drag(hz);
      const reference = drag(120);
      let shift = 0;
      for (let index = 0; index < dragged.positions.length; index += 3)
        shift = Math.max(shift, dragged.positions[index] - dragged.rest[index]);
      expect(shift).toBeGreaterThan(0.015);
      const response = metrics(dragged.positions, dragged.rest, 3, 0)[2];
      const expected = metrics(reference.positions, reference.rest, 3, 0)[2];
      expect(Math.abs(response / expected - 1)).toBeLessThan(0.1);
    },
  );

  it("keeps held response consistent across quality tiers", () => {
    const response = [
      [16, 10],
      [20, 12],
      [28, 18],
    ].map(([columns = 20, rows = 12]) => {
      const cloth = createCloth(6.4, 4, columns, rows, {
        bend: 0.35,
        damping: 0.9,
        shape: 22,
      });
      for (let frame = 0; frame < 120; frame += 1)
        stepCloth(cloth, 1 / 120, { x: 0.5, y: 0.5, pressure: 1 });
      return metrics(cloth.positions, cloth.rest, 3)[2];
    });
    expect(Math.max(...response) / Math.min(...response)).toBeLessThan(1.1);
  });

  it.each([
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
    [-1, 0],
    [1e9, 4],
  ])("stays finite for delta %s", (delta, expectedSteps) => {
    const cloth = createCloth(4, 3, 8, 6);
    cloth.accumulator = Number.NaN;
    expect(stepCloth(cloth, delta, { x: Number.NaN, y: 0, pressure: 1 })).toBe(
      expectedSteps,
    );
    expect([...cloth.positions, ...cloth.previous].every(Number.isFinite)).toBe(
      true,
    );
    expect(cloth.accumulator).toBe(0);
  });

  it("deforms locally and settles after release", () => {
    const cloth = run(120, 1, { x: 0.5, y: 0.45, pressure: 1 });
    const [minimum, pressed] = metrics(cloth.positions, cloth.rest, 3);
    expect(minimum).toBeLessThan(-0.2);
    stepCloth(cloth, 1 / 120);
    expect(clothIsMoving(cloth)).toBe(true);
    const releaseMotion = metrics(cloth.positions, cloth.previous)[2];
    for (let frame = 1; frame < 120 * 4; frame += 1) stepCloth(cloth, 1 / 120);
    expect(pressed).toBeGreaterThan(0.2);
    expect(metrics(cloth.positions, cloth.rest, 3)[1]).toBeLessThan(
      pressed * 0.25,
    );
    expect(metrics(cloth.positions, cloth.previous)[2]).toBeLessThan(
      releaseMotion * 0.25,
    );
    expect(clothIsMoving(cloth)).toBe(false);
  });
});
