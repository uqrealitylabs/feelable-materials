export const resolutionPresets = [
  { id: "144p", width: 256, height: 144 },
  { id: "240p", width: 426, height: 240 },
  { id: "360p", width: 640, height: 360 },
  { id: "480p", width: 854, height: 480 },
  { id: "720p", width: 1280, height: 720 },
  { id: "1080p", width: 1920, height: 1080 },
  { id: "1440p", width: 2560, height: 1440 },
  { id: "4k", width: 3840, height: 2160 },
  { id: "8k", width: 7680, height: 4320 },
] as const;

export type Resolution = (typeof resolutionPresets)[number]["id"];
export type RenderQuality = Resolution | "dynamic";
export type SceneDetail = "low" | "standard" | "high";

export type RenderCeilings = {
  deploymentCeiling?: Resolution | undefined;
  serverCeiling?: Resolution | undefined;
};

export type RenderLimits = RenderCeilings & {
  cssWidth: number;
  cssHeight: number;
  devicePixelRatio: number;
  maxWidth: number;
  maxHeight: number;
  maxPixels: number;
  deviceMemory?: number | undefined;
  hardwareConcurrency?: number | undefined;
  reducedMotion?: boolean | undefined;
  saveData?: boolean | undefined;
};

export type RenderProfile = {
  effective: Resolution;
  dpr: number;
  width: number;
  height: number;
  capped: boolean;
};

export type AdaptiveQualityState = {
  resolution: Resolution;
  slowFrames: number;
  severeFrames: number;
  fastFrames: number;
  cooldown: number;
};

const rank = (resolution: Resolution) =>
  resolutionPresets.findIndex(({ id }) => id === resolution);
const preset = (resolution: Resolution) => resolutionPresets[rank(resolution)];
const lower = (left: Resolution, right?: Resolution) =>
  right && rank(right) < rank(left) ? right : left;
const finitePositive = (value: number, fallback: number) =>
  Number.isFinite(value) && value > 0 ? value : fallback;

export function parseResolution(value: string | null | undefined) {
  return resolutionPresets.find(({ id }) => id === value)?.id;
}

export function framebufferPixelBudget(deviceMemory?: number) {
  if (deviceMemory === undefined || !Number.isFinite(deviceMemory))
    return 3840 * 2160;
  if (deviceMemory <= 2) return 1920 * 1080;
  if (deviceMemory <= 4) return 3840 * 2160;
  return 7680 * 4320;
}

export function sceneDetailForQuality(quality: RenderQuality): SceneDetail {
  const index = rank(quality === "dynamic" ? "1080p" : quality);
  return index <= 3 ? "low" : index <= 5 ? "standard" : "high";
}

function capabilityCeiling(limits: RenderLimits) {
  const maxWidth = finitePositive(limits.maxWidth, 1);
  const maxHeight = finitePositive(limits.maxHeight, 1);
  const maxPixels = finitePositive(limits.maxPixels, 1);
  let ceiling: Resolution = "144p";
  for (const candidate of resolutionPresets)
    if (
      candidate.width <= maxWidth &&
      candidate.height <= maxHeight &&
      candidate.width * candidate.height <= maxPixels
    )
      ceiling = candidate.id;
  return ceiling;
}

function adaptiveStart(limits: RenderLimits) {
  const displayHeight =
    finitePositive(limits.cssHeight, 1) *
    finitePositive(limits.devicePixelRatio, 1) *
    1.5;
  let display: Resolution = "144p";
  for (const candidate of resolutionPresets)
    if (candidate.height <= displayHeight) display = candidate.id;

  const memory = limits.deviceMemory;
  const cores = limits.hardwareConcurrency;
  let device: Resolution = "1080p";
  if (limits.reducedMotion || limits.saveData) device = "360p";
  else if ((memory !== undefined && memory <= 2) || (cores ?? 3) <= 2)
    device = "480p";
  else if ((memory !== undefined && memory <= 4) || (cores ?? 5) <= 4)
    device = "720p";
  else if (memory !== undefined && cores !== undefined) {
    if (memory >= 8 && cores >= 8) device = "4k";
    else if (memory >= 4 && cores >= 4) device = "1440p";
  }
  return lower(display, device);
}

export function resolveRenderProfile(
  requested: RenderQuality,
  limits: RenderLimits,
  adaptiveResolution?: Resolution,
): RenderProfile {
  const desired =
    requested === "dynamic"
      ? (adaptiveResolution ?? adaptiveStart(limits))
      : requested;
  let effective = desired;
  effective = lower(effective, limits.deploymentCeiling);
  effective = lower(effective, limits.serverCeiling);
  effective = lower(effective, capabilityCeiling(limits));

  const target = preset(effective);
  const cssWidth = finitePositive(limits.cssWidth, 1);
  const cssHeight = finitePositive(limits.cssHeight, 1);
  const maxWidth = finitePositive(limits.maxWidth, 1);
  const maxHeight = finitePositive(limits.maxHeight, 1);
  const maxPixels = finitePositive(limits.maxPixels, 1);
  const dpr = Math.min(
    target.width / cssWidth,
    target.height / cssHeight,
    maxWidth / cssWidth,
    maxHeight / cssHeight,
    Math.sqrt(maxPixels / (cssWidth * cssHeight)),
  );
  return {
    effective,
    dpr,
    width: Math.max(1, Math.floor(cssWidth * dpr)),
    height: Math.max(1, Math.floor(cssHeight * dpr)),
    capped: effective !== desired,
  };
}

export function createAdaptiveQualityState(
  resolution: Resolution,
): AdaptiveQualityState {
  return {
    resolution,
    slowFrames: 0,
    severeFrames: 0,
    fastFrames: 0,
    cooldown: 0,
  };
}

export function sampleAdaptiveQuality(
  state: AdaptiveQualityState,
  frameMs: number,
) {
  if (!Number.isFinite(frameMs) || frameMs <= 0) {
    state.slowFrames = 0;
    state.severeFrames = 0;
    state.fastFrames = 0;
    return state.resolution;
  }
  state.cooldown = Math.max(0, state.cooldown - 1);
  state.severeFrames = frameMs >= 250 ? state.severeFrames + 1 : 0;
  state.slowFrames = frameMs > 20 && frameMs < 250 ? state.slowFrames + 1 : 0;
  state.fastFrames = frameMs < 12 ? state.fastFrames + 1 : 0;
  const shift =
    state.slowFrames >= 45 || state.severeFrames >= 4
      ? -1
      : state.fastFrames >= 180
        ? 1
        : 0;
  if (state.cooldown || !shift) return state.resolution;
  const next = resolutionPresets[rank(state.resolution) + shift]?.id;
  state.slowFrames = 0;
  state.severeFrames = 0;
  state.fastFrames = 0;
  state.cooldown = 90;
  if (next) state.resolution = next;
  return state.resolution;
}
