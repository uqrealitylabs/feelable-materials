import {
  type FeelableMaterialConfig,
  type MaterialEventKind,
  materialPresets,
} from "../materials/materialPresets.js";
import { gaussianInfluence } from "./gaussianDrift.js";

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
  return {
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
}

export function createPokeModel() {
  return createPokeState();
}

export function computePointerVelocity(
  previous: { x: number; y: number },
  next: { x: number; y: number },
  deltaMs = 16.67,
) {
  const safeDelta = Math.max(1, deltaMs);
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
  state.previousX = state.x;
  state.previousY = state.y;
  state.x = clamp(x, 0, 1);
  state.y = clamp(y, 0, 1);
  state.targetPressure = clamp(pressure, 0.1, 1);
  state.active = true;
}

export function releasePoke(state: PokeState) {
  state.targetPressure = 0;
  state.active = false;
}

export function getPokeVelocity(state: PokeState) {
  return computePointerVelocity(
    { x: state.previousX, y: state.previousY },
    { x: state.x, y: state.y },
    16.67,
  );
}

export function stepPoke(
  state: PokeState,
  config: FeelableMaterialConfig = materialPresets.cloth,
  deltaMs = 16.67,
) {
  const velocity = getPokeVelocity(state);
  const decay = config.decay ** (Math.max(1, deltaMs) / 16.67);
  const target = state.active ? state.targetPressure : 0;

  if (config.kind === "glass" && state.active) {
    state.stains = clamp(state.stains + state.targetPressure * 0.18, 0, 1);
    state.stains = clamp(state.stains + velocity.length * config.smear, 0, 1);
  }
  if (
    state.active &&
    (config.kind === "rubber" || config.kind === "cloth") &&
    velocity.length >= config.damageVelocity
  ) {
    state.scratches += 1;
  }
  if (
    state.active &&
    config.kind === "grass" &&
    velocity.length >= config.cutVelocity
  ) {
    state.cuts += Math.max(1, Math.round(velocity.length * 8));
  }

  state.pressure += (target - state.pressure) * (1 - decay);
  state.stains *= config.kind === "glass" ? 0.985 : 0.94;
  if (!state.active) state.targetPressure = 0;
  state.active = false;
  state.previousX = state.x;
  state.previousY = state.y;

  if (state.pressure < 0.001 && state.targetPressure === 0) state.pressure = 0;
  if (state.stains < 0.001) state.stains = 0;
}

export function updatePokeModel(
  state: PokeState,
  config: FeelableMaterialConfig,
  event: { x: number; y: number; pressure?: number; active?: boolean } | null,
  deltaMs = 16.67,
) {
  if (event) applyPoke(state, event.x, event.y, event.pressure);
  if (event?.active === false) releasePoke(state);
  stepPoke(state, config, deltaMs);

  return state;
}

export function getPokeInfluence(
  state: PokeState,
  x: number,
  y: number,
  radius = 0.26,
) {
  const distance = Math.hypot(x - state.x, y - state.y);
  return Math.max(0, 1 - distance / radius) * state.pressure;
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

  return {
    influence,
    depression: influence * config.deformation,
    bulge: config.kind === "rubber" ? influence * config.elasticity : 0,
    crease: config.kind === "cloth" ? influence * config.deformation : 0,
    smear: config.kind === "glass" ? state.stains : 0,
    smudge: config.kind === "glass" ? state.stains : 0,
    scratch: state.scratches > 0,
    cut: state.cuts > 0,
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
): MaterialEventKind {
  const velocity = getPokeVelocity(state);

  if (config.kind === "grass" && velocity.length >= config.cutVelocity) {
    return "cut";
  }
  if (config.kind === "glass" && velocity.length > 0.22) return "fastSwipe";
  if (velocity.length >= config.damageVelocity) return "damage";
  if (pressure > 0.55) return "press";
  return pressure > 0.1 ? "contact" : "hover";
}

export function createGrassBladeInstances(options: GrassBladeOptions = {}) {
  const count = options.count ?? materialPresets.grass.bladeCount;
  const seed = options.seed ?? 1;
  const blades: GrassBladeInstance[] = [];
  let attempt = 0;

  while (blades.length < count && attempt < count * 8) {
    const x = seededUnit(seed, attempt, 11);
    const y = seededUnit(seed, attempt, 37);
    attempt += 1;

    if (options.mask && !options.mask(x, y)) continue;

    blades.push({
      x,
      y,
      height: 0.38 + seededUnit(seed, attempt, 71) * 0.5,
      width: 0.012 + seededUnit(seed, attempt, 89) * 0.02,
      angle: -0.6 + seededUnit(seed, attempt, 113) * 1.2,
      stiffness: 0.45 + seededUnit(seed, attempt, 131) * 0.45,
    });
  }

  return blades;
}

function seededUnit(seed: number, index: number, salt: number) {
  const value = Math.sin((seed + salt) * 12.9898 + index * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
