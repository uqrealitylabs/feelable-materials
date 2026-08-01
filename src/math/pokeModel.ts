import {
  type FeelableMaterialConfig,
  type MaterialEventKind,
  materialPresets,
} from "../materials/materialPresets.js";
import { gaussianInfluence } from "./gaussianDrift.js";
import { clamp } from "./numbers.js";
import { resolveGrassBladeCount } from "./reducedMotionSurface.js";

export type PokeState = {
  x: number;
  y: number;
  previousX: number;
  previousY: number;
  pressure: number;
  targetPressure: number;
  active: boolean;
  stains: number;
  scratches: number;
  cuts: number;
};

export type GrassBladeInstance = {
  x: number;
  y: number;
  height: number;
  width: number;
  angle: number;
  stiffness: number;
};

export type GrassBladeOptions = {
  count?: number | undefined;
  seed?: number | undefined;
  mask?: ((x: number, y: number) => boolean) | undefined;
};

export function createPokeState(overrides: Partial<PokeState> = {}): PokeState {
  const state = {
    x: 0.5,
    y: 0.5,
    previousX: 0.5,
    previousY: 0.5,
    pressure: 0,
    targetPressure: 0,
    active: false,
    stains: 0,
    scratches: 0,
    cuts: 0,
    ...overrides,
  };
  state.x = clamp(state.x, 0, 1, 0.5);
  state.y = clamp(state.y, 0, 1, 0.5);
  state.previousX = clamp(state.previousX, 0, 1, state.x);
  state.previousY = clamp(state.previousY, 0, 1, state.y);
  state.pressure = clamp(state.pressure, 0, 1);
  state.targetPressure = clamp(state.targetPressure, 0, 1);
  state.stains = clamp(state.stains, 0, 1);
  state.scratches = validDamageCount(state.scratches);
  state.cuts = validDamageCount(state.cuts);
  return state;
}

export function computePointerVelocity(
  previous: { x: number; y: number },
  next: { x: number; y: number },
  deltaMs = 16.67,
) {
  const safeDelta = Math.max(1, Number.isFinite(deltaMs) ? deltaMs : 16.67);
  const x = next.x - previous.x;
  const y = next.y - previous.y;
  const length = Math.hypot(x, y);

  return { x, y, length, perSecond: (length / safeDelta) * 1000 };
}

export function applyPoke(
  state: PokeState,
  x: number,
  y: number,
  pressure = 0.25,
) {
  const nextX = clamp(x, 0, 1, state.x);
  const nextY = clamp(y, 0, 1, state.y);
  if (!state.active) {
    state.previousX = nextX;
    state.previousY = nextY;
  }
  state.x = nextX;
  state.y = nextY;
  state.targetPressure = clamp(pressure, 0, 1);
  state.active = true;
}

export function releasePoke(state: PokeState) {
  state.targetPressure = 0;
  state.active = false;
}

export function getPokeVelocity(state: PokeState, deltaMs = 16.67) {
  return computePointerVelocity(
    { x: state.previousX, y: state.previousY },
    { x: state.x, y: state.y },
    deltaMs,
  );
}

export function stepPoke(
  state: PokeState,
  config: FeelableMaterialConfig = materialPresets.cloth,
  deltaMs = 16.67,
) {
  const elapsedMs = Number.isFinite(deltaMs) ? Math.max(0, deltaMs) : 16.67;
  const velocity = getPokeVelocity(state, elapsedMs);
  if (elapsedMs === 0) return velocity;
  const frames = elapsedMs / 16.67;
  const motion = velocity.perSecond * (16.67 / 1000);
  const decay = clamp(config.decay, 0, 1, 0.86) ** frames;
  const target = state.active ? state.targetPressure : 0;

  if (
    state.active &&
    state.targetPressure > 0.55 &&
    (config.kind === "rubber" || config.kind === "cloth") &&
    motion >= config.damageVelocity
  ) {
    state.scratches = Math.max(1, state.scratches);
  }
  if (
    state.active &&
    state.targetPressure > 0.55 &&
    config.kind === "grass" &&
    motion >= config.cutVelocity
  ) {
    state.cuts = Math.max(1, state.cuts);
  }

  state.pressure += (target - state.pressure) * (1 - decay);
  const stainDecay = 0.94;
  const stainFade = stainDecay ** frames;
  if (config.kind === "glass" && state.active && state.targetPressure > 0.55) {
    const contact =
      state.targetPressure *
      0.18 *
      stainDecay *
      ((1 - stainFade) / (1 - stainDecay));
    state.stains = clamp(
      (state.stains + velocity.length * config.smear) * stainFade + contact,
      0,
      1,
    );
  } else {
    state.stains *= stainFade;
  }
  if (!state.active) state.targetPressure = 0;
  state.previousX = state.x;
  state.previousY = state.y;

  if (state.pressure < 0.001 && state.targetPressure === 0) state.pressure = 0;
  if (state.stains < 0.001) state.stains = 0;
  return velocity;
}

export function getPokeInfluence(
  state: PokeState,
  x: number,
  y: number,
  radius = 0.26,
) {
  return gaussianInfluence(
    Math.hypot(x - state.x, y - state.y),
    radius,
    state.pressure,
  );
}

export function getMaterialResponse(
  config: FeelableMaterialConfig,
  state: PokeState,
  x = state.x,
  y = state.y,
) {
  const influence = gaussianInfluence(
    Math.hypot(x - state.x, y - state.y),
    config.radius,
    state.pressure,
  );
  const localContact = influence > 0.001;

  return {
    influence,
    depression: influence * config.deformation,
    bulge: config.kind === "rubber" ? influence * config.elasticity : 0,
    crease: config.kind === "cloth" ? influence * config.deformation : 0,
    smear: config.kind === "glass" ? state.stains : 0,
    smudge: config.kind === "glass" ? state.stains : 0,
    highlight:
      config.kind === "enamel"
        ? influence * (1 - config.roughness)
        : influence * 0.35,
    contactShadow:
      localContact && config.kind !== "glass" ? influence * 0.45 : 0,
    gloss: config.kind === "enamel" ? influence * 0.9 : 0,
    scratch: localContact && state.scratches > 0,
    cut: localContact && state.cuts > 0,
    resistance: state.pressure * config.resistance,
    bend:
      config.kind === "grass" || config.kind === "mail"
        ? influence * config.deformation
        : 0,
  };
}

export function getMaterialEventKind(
  config: FeelableMaterialConfig,
  state: PokeState,
  pressure: number,
  deltaMs = 16.67,
): MaterialEventKind {
  const velocity = getPokeVelocity(state, deltaMs);
  const motion = velocity.perSecond * (16.67 / 1000);

  if (
    config.kind === "grass" &&
    pressure > 0.55 &&
    motion >= config.cutVelocity
  ) {
    return "cut";
  }
  if (config.kind === "glass" && motion > 0.22) return "fastSwipe";
  if (pressure > 0.55 && motion >= config.damageVelocity) return "damage";
  if (pressure > 0.55) return "press";
  return pressure > 0.1 ? "contact" : "hover";
}

export function createGrassBladeInstances(options: GrassBladeOptions = {}) {
  const count = resolveGrassBladeCount(
    options.count ?? materialPresets.grass.bladeCount,
  );
  const seed = options.seed ?? 1;
  if (!Number.isSafeInteger(seed))
    throw new RangeError("grass blade seed must be a safe integer");
  const blades: GrassBladeInstance[] = [];
  let attempt = 0;

  while (blades.length < count && attempt < count * 8) {
    const x = seededUnit(seed, attempt, 11);
    const y = seededUnit(seed, attempt, 37);
    attempt += 1;

    const blade = {
      x,
      y,
      height: 0.38 + seededUnit(seed, attempt, 71) * 0.5,
      width: 0.012 + seededUnit(seed, attempt, 89) * 0.02,
      angle: -Math.PI + seededUnit(seed, attempt, 113) * Math.PI * 2,
      stiffness: 0.45 + seededUnit(seed, attempt, 131) * 0.45,
    };
    const dx = (Math.cos(blade.angle) * blade.width) / 2;
    const dy = (Math.sin(blade.angle) * blade.width) / 2;
    if (
      Math.abs(x - 0.5) + Math.abs(dx) > 0.5 ||
      Math.abs(y - 0.5) + Math.abs(dy) > 0.5 ||
      (options.mask &&
        (!options.mask(x, y) ||
          !options.mask(x - dx, y - dy) ||
          !options.mask(x + dx, y + dy)))
    )
      continue;
    blades.push(blade);
  }

  return blades;
}

function seededUnit(seed: number, index: number, salt: number) {
  const value = Math.sin((seed + salt) * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function validDamageCount(value: number) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}
