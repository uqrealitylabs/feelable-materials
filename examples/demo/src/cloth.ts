const FIXED_STEP = 1 / 120;
const MAX_FRAME = 1 / 30;
const segments = (value: number, fallback: number) =>
  Number.isFinite(value)
    ? Math.min(64, Math.max(2, Math.trunc(value)))
    : fallback;
const dimension = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0
    ? Math.min(64, Math.max(0.01, value))
    : fallback;

export function createCloth(
  width = 6.4,
  height = 4,
  columns = 24,
  rows = 15,
  options: { bend?: number; damping?: number; shape?: number } = {},
) {
  width = dimension(width, 6.4);
  height = dimension(height, 4);
  columns = segments(columns, 24);
  rows = segments(rows, 15);
  const positions = new Float32Array((columns + 1) * (rows + 1) * 3);
  const links: number[] = [];
  const vertex = (x: number, y: number) => y * (columns + 1) + x;
  const { bend = 0.3, damping = 0.94, shape = 24 } = options;
  const link = (a: number, b: number, stiffness = 1) => {
    const ai = a * 3;
    const bi = b * 3;
    links.push(
      a,
      b,
      Math.hypot(
        positions[ai] - positions[bi],
        positions[ai + 1] - positions[bi + 1],
        positions[ai + 2] - positions[bi + 2],
      ),
      stiffness,
    );
  };

  for (let y = 0; y <= rows; y += 1) {
    for (let x = 0; x <= columns; x += 1) {
      const index = vertex(x, y) * 3;
      positions[index] = (x / columns - 0.5) * width;
      positions[index + 1] = (0.5 - y / rows) * height;
      const u = x / columns;
      positions[index + 2] =
        (y / rows) * Math.sin(u * Math.PI * 3 + u * u * 1.4 + 0.35) * 0.22;
      if (x) link(vertex(x, y), vertex(x - 1, y));
      if (y) link(vertex(x, y), vertex(x, y - 1));
      if (x && y) {
        link(vertex(x, y), vertex(x - 1, y - 1));
        link(vertex(x - 1, y), vertex(x, y - 1));
      }
      if (x > 1) link(vertex(x, y), vertex(x - 2, y), bend);
      if (y > 1) link(vertex(x, y), vertex(x, y - 2), bend);
    }
  }

  return {
    positions,
    previous: positions.slice(),
    rest: positions.slice(),
    links: Float32Array.from(links),
    columns,
    rows,
    width,
    height,
    damping,
    shape,
    contactX: -1,
    contactY: -1,
    pinned: (columns + 1) * 3,
    accumulator: 0,
  };
}

export type Cloth = ReturnType<typeof createCloth>;
export type ClothContact = { x: number; y: number; pressure: number };

export function clothIsMoving(cloth: Cloth, tolerance = 0.0001) {
  for (let index = cloth.pinned; index < cloth.positions.length; index += 1)
    if (Math.abs(cloth.positions[index] - cloth.previous[index]) > tolerance)
      return true;
  return false;
}

function solve(cloth: Cloth) {
  const { links, pinned, positions, rest } = cloth;
  const iterations = cloth.columns * cloth.rows > 300 ? 12 : 10;
  for (let iteration = 0; iteration < iterations; iteration += 1) {
    for (let link = 0; link < links.length; link += 4) {
      const a = links[link] * 3;
      const b = links[link + 1] * 3;
      const dx = positions[b] - positions[a];
      const dy = positions[b + 1] - positions[a + 1];
      const dz = positions[b + 2] - positions[a + 2];
      const distance = Math.hypot(dx, dy, dz);
      const aFree = a >= pinned ? 1 : 0;
      const bFree = b >= pinned ? 1 : 0;
      const weight = aFree + bFree;
      const scale =
        distance > 1e-6 && weight
          ? ((distance - links[link + 2]) / distance / weight) * links[link + 3]
          : 0;
      for (let axis = 0; axis < 3; axis += 1) {
        const correction = (axis === 0 ? dx : axis === 1 ? dy : dz) * scale;
        positions[a + axis] += correction * aFree;
        positions[b + axis] -= correction * bFree;
      }
    }
    for (let pin = 0; pin < pinned; pin += 1) positions[pin] = rest[pin];
  }
}

function fixedStep(
  cloth: Cloth,
  contact: ClothContact | undefined,
  dragScale: number,
  contactProgress: number,
) {
  const { pinned, positions, previous, rest } = cloth;
  for (let index = pinned; index < positions.length; index += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      const i = index + axis;
      const current = positions[i];
      const before = previous[i];
      previous[i] = current;
      positions[i] = current + (current - before) * cloth.damping;
    }
    positions[index + 1] -= 3 * FIXED_STEP ** 2;
    positions[index + 2] +=
      (rest[index + 2] - positions[index + 2]) * cloth.shape * FIXED_STEP ** 2;
  }

  if (
    contact &&
    Number.isFinite(contact.x) &&
    Number.isFinite(contact.y) &&
    Number.isFinite(contact.pressure)
  ) {
    const targetX = Math.min(1, Math.max(0, contact.x));
    const targetY = Math.min(1, Math.max(0, contact.y));
    const currentX =
      cloth.contactX + (targetX - cloth.contactX) * contactProgress;
    const currentY =
      cloth.contactY + (targetY - cloth.contactY) * contactProgress;
    const x = (currentX - 0.5) * cloth.width;
    const y = (currentY - 0.5) * cloth.height;
    const pressure = Math.min(1, Math.max(0, contact.pressure));
    const drag = pressure * dragScale * 2;
    const dragX = (targetX - cloth.contactX) * cloth.width * drag;
    const dragY = (targetY - cloth.contactY) * cloth.height * drag;
    const radius = Math.min(cloth.width, cloth.height) * 0.22;
    const depthScale = Math.cbrt((cloth.columns * cloth.rows) / 240);
    for (let index = pinned; index < positions.length; index += 3) {
      const influence =
        1 - Math.hypot(positions[index] - x, positions[index + 1] - y) / radius;
      if (influence > 0) {
        const grip = influence ** 2;
        positions[index] += dragX * grip;
        positions[index + 1] += dragY * grip;
        const target = rest[index + 2] - pressure * grip * 0.55 * depthScale;
        const shift = Math.min(0, target - positions[index + 2]);
        positions[index + 2] += shift;
        previous[index + 2] += shift;
      }
    }
  }
  solve(cloth);
}

export function stepCloth(cloth: Cloth, delta: number, contact?: ClothContact) {
  cloth.accumulator = Number.isFinite(cloth.accumulator)
    ? cloth.accumulator
    : 0;
  cloth.accumulator += Number.isFinite(delta)
    ? Math.min(MAX_FRAME, Math.max(0, delta))
    : 0;
  const steps = Math.min(
    4,
    Math.floor((cloth.accumulator + 1e-9) / FIXED_STEP),
  );
  cloth.accumulator -= steps * FIXED_STEP;
  if (!contact || !Number.isFinite(contact.x) || !Number.isFinite(contact.y)) {
    cloth.contactX = -1;
    cloth.contactY = -1;
  } else if (cloth.contactX < 0) {
    cloth.contactX = Math.min(1, Math.max(0, contact.x));
    cloth.contactY = Math.min(1, Math.max(0, contact.y));
  }
  for (let step = 0; step < steps; step += 1)
    fixedStep(cloth, contact, 1 / steps, (step + 1) / steps);
  if (
    steps &&
    contact &&
    Number.isFinite(contact.x) &&
    Number.isFinite(contact.y)
  ) {
    cloth.contactX = Math.min(1, Math.max(0, contact.x));
    cloth.contactY = Math.min(1, Math.max(0, contact.y));
  }
  return steps;
}
