import {
  type FeelableMaterialConfig,
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
  smudge: number;
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
    smudge: 0,
    ...overrides,
  };
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

export function stepPoke(
  state: PokeState,
  config: FeelableMaterialConfig = materialPresets.cloth,
) {
  const target = state.active ? state.targetPressure : 0;
  state.pressure += (target - state.pressure) * (1 - config.decay);

  if (config.kind === "glass" && state.active) {
    state.smudge = clamp(
      state.smudge + state.pressure * config.smear * 0.08,
      0,
      1,
    );
  } else {
    state.smudge *= config.kind === "glass" ? 0.94 : 0.9;
  }

  if (!state.active) state.targetPressure = 0;
  state.active = false;

  if (state.pressure < 0.001 && state.targetPressure === 0) {
    state.pressure = 0;
  }
  if (state.smudge < 0.001) state.smudge = 0;
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

export function getPokeVelocity(state: PokeState) {
  const x = state.x - state.previousX;
  const y = state.y - state.previousY;

  return {
    x,
    y,
    length: Math.hypot(x, y),
  };
}

export function getMaterialResponse(
  state: PokeState,
  config: FeelableMaterialConfig,
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
    smudge: config.kind === "glass" ? state.smudge : 0,
    bend:
      config.kind === "grass" || config.kind === "mail"
        ? influence * config.deformation
        : 0,
  };
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
