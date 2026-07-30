import { describe, expect, it } from "vitest";
import {
  createAdaptiveQualityState,
  framebufferPixelBudget,
  parseResolution,
  type RenderLimits,
  resolutionPresets,
  resolveRenderProfile,
  sampleAdaptiveQuality,
  sceneDetailForQuality,
} from "../../examples/demo/src/render-quality";

const limits: RenderLimits = {
  cssWidth: 800,
  cssHeight: 600,
  devicePixelRatio: 2,
  maxWidth: 7680,
  maxHeight: 4320,
  maxPixels: 7680 * 4320,
  deviceMemory: 8,
  hardwareConcurrency: 8,
};

describe("render quality policy", () => {
  it.each(resolutionPresets)("bounds the $id framebuffer", (resolution) => {
    const profile = resolveRenderProfile(resolution.id, limits);
    expect(profile.effective).toBe(resolution.id);
    expect(profile.width).toBeLessThanOrEqual(resolution.width);
    expect(profile.height).toBeLessThanOrEqual(resolution.height);
    expect(profile.dpr).toBeGreaterThan(0);
    expect(profile.capped).toBe(false);
  });

  it.each([
    ["144p", "144p"],
    ["8k", "8k"],
    ["4K", undefined],
    ["1080", undefined],
    ["dynamic", undefined],
    ["", undefined],
    [null, undefined],
  ] as const)("validates preset input %s", (value, expected) => {
    expect(parseResolution(value)).toBe(expected);
  });

  it.each([
    [{ deploymentCeiling: "1440p" as const }, "1440p"],
    [{ serverCeiling: "720p" as const }, "720p"],
    [
      {
        deploymentCeiling: "1440p" as const,
        serverCeiling: "720p" as const,
      },
      "720p",
    ],
    [{ maxWidth: 4096 }, "4k"],
    [{ maxPixels: 1920 * 1080 }, "1080p"],
  ] as const)("applies the lowest ceiling %#", (overrides, expected) => {
    const profile = resolveRenderProfile("8k", { ...limits, ...overrides });
    expect(profile.effective).toBe(expected);
    expect(profile.capped).toBe(true);
  });

  it.each([
    [{}, "1080p"],
    [{ reducedMotion: true }, "360p"],
    [{ saveData: true }, "360p"],
    [{ deviceMemory: 2, hardwareConcurrency: 8 }, "480p"],
    [{ deviceMemory: 8, hardwareConcurrency: 4 }, "720p"],
    [{ deviceMemory: 6, hardwareConcurrency: 6 }, "1440p"],
    [{ deviceMemory: 8, hardwareConcurrency: 8 }, "4k"],
    [{ deviceMemory: Number.NaN, hardwareConcurrency: Number.NaN }, "1080p"],
  ] as const)("selects a dynamic device ceiling %#", (hints, expected) => {
    const profile = resolveRenderProfile("dynamic", {
      ...limits,
      cssHeight: 720,
      devicePixelRatio: 2,
      deviceMemory: undefined,
      hardwareConcurrency: undefined,
      ...hints,
    });
    expect(profile.effective).toBe(expected);
  });

  it.each([
    [undefined, 3840 * 2160],
    [Number.NaN, 3840 * 2160],
    [1, 1920 * 1080],
    [4, 3840 * 2160],
    [8, 7680 * 4320],
  ])("uses a bounded pixel budget for %s GiB", (memory, expected) => {
    expect(framebufferPixelBudget(memory)).toBe(expected);
  });

  it.each([
    ["144p", "low"],
    ["480p", "low"],
    ["720p", "standard"],
    ["dynamic", "standard"],
    ["1440p", "high"],
    ["8k", "high"],
  ] as const)("maps %s to %s scene detail", (quality, expected) => {
    expect(sceneDetailForQuality(quality)).toBe(expected);
  });

  it("stays finite for unusable browser limits", () => {
    const profile = resolveRenderProfile("8k", {
      ...limits,
      cssWidth: 0,
      cssHeight: Number.NaN,
      maxWidth: 0,
      maxHeight: Number.POSITIVE_INFINITY,
      maxPixels: -1,
    });
    expect(profile).toMatchObject({ effective: "144p", width: 1, height: 1 });
    expect(profile.dpr).toBe(1);
  });
});

describe("dynamic frame adaptation", () => {
  it.each([
    ["144p", 21, 45, "144p"],
    ["720p", 21, 44, "720p"],
    ["720p", 21, 45, "480p"],
    ["720p", 120, 45, "480p"],
    ["720p", 500, 3, "720p"],
    ["720p", 500, 4, "480p"],
    ["720p", 11, 179, "720p"],
    ["720p", 11, 180, "1080p"],
    ["8k", 11, 180, "8k"],
  ] as const)(
    "%s at %ims for %i active frames resolves to %s",
    (resolution, frameMs, frames, expected) => {
      const state = createAdaptiveQualityState(resolution);
      for (let frame = 0; frame < frames; frame += 1)
        sampleAdaptiveQuality(state, frameMs);
      expect(state.resolution).toBe(expected);
    },
  );

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "resets streaks for invalid frame interval %s",
    (frameMs) => {
      const state = createAdaptiveQualityState("720p");
      state.slowFrames = 4;
      state.severeFrames = 2;
      state.fastFrames = 3;
      sampleAdaptiveQuality(state, frameMs);
      expect(state).toMatchObject({
        resolution: "720p",
        slowFrames: 0,
        severeFrames: 0,
        fastFrames: 0,
      });
    },
  );

  it.each([250, 500, 10_000])(
    "starts a separate severe streak for a %ims gap",
    (frameMs) => {
      const state = createAdaptiveQualityState("720p");
      state.slowFrames = 44;
      sampleAdaptiveQuality(state, frameMs);
      expect(state).toMatchObject({
        resolution: "720p",
        slowFrames: 0,
        severeFrames: 1,
      });
    },
  );

  it.each([
    [21, 44],
    [11, 179],
  ])("does not join %ims streaks across idle gaps", (frameMs, frames) => {
    const state = createAdaptiveQualityState("720p");
    for (let frame = 0; frame < frames; frame += 1)
      sampleAdaptiveQuality(state, frameMs);
    sampleAdaptiveQuality(state, 500);
    sampleAdaptiveQuality(state, frameMs);
    expect(state.resolution).toBe("720p");
  });

  it("uses a cooldown after changing tiers", () => {
    const state = createAdaptiveQualityState("720p");
    for (let frame = 0; frame < 45; frame += 1)
      sampleAdaptiveQuality(state, 21);
    for (let frame = 0; frame < 90; frame += 1)
      sampleAdaptiveQuality(state, 11);
    expect(state).toMatchObject({ resolution: "480p", cooldown: 0 });
  });
});
