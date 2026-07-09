import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyPoke,
  createGrassBladeInstances,
  createPokeState,
  getMaterialResponse,
  getPokeInfluence,
  materialPresets,
  readPointerUv,
  releasePoke,
  resolveGrassBladeCount,
  resolveReducedMotionSurface,
  stepPoke,
} from "../src";

describe("material presets", () => {
  it.each([
    ["cloth", "crease"],
    ["rubber", "squish"],
    ["glass", "smudge"],
    ["grass", "bend"],
    ["mail", "bend"],
  ] as const)("maps %s to %s behaviour", (kind, behavior) => {
    expect(materialPresets[kind]).toMatchObject({
      kind,
      behavior,
      pointerResponse: true,
    });
  });
});

describe("pointer UV", () => {
  it("uses local UVs and falls back to center instead of fake world-space UVs", () => {
    expect(readPointerUv({ uv: { x: 0.2, y: 0.8 } })).toEqual({
      x: 0.2,
      y: 0.8,
    });
    expect(readPointerUv({})).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("poke model", () => {
  it("keeps pointer response local to the contact point", () => {
    const state = createPokeState();
    applyPoke(state, 0.25, 0.25, 1);
    stepPoke(state, materialPresets.rubber);

    expect(getPokeInfluence(state, 0.25, 0.25)).toBeGreaterThan(0);
    expect(getPokeInfluence(state, 0.95, 0.95)).toBe(0);
  });

  it("makes press stronger than hover and decays toward rest", () => {
    const hover = createPokeState();
    const press = createPokeState();

    applyPoke(hover, 0.5, 0.5, 0.25);
    applyPoke(press, 0.5, 0.5, 0.9);
    stepPoke(hover, materialPresets.cloth);
    stepPoke(press, materialPresets.cloth);

    expect(press.pressure).toBeGreaterThan(hover.pressure);

    for (let i = 0; i < 40; i += 1) {
      stepPoke(press, materialPresets.cloth);
    }

    expect(press.pressure).toBeLessThan(0.1);
  });

  it("accumulates and fades glass contact marks", () => {
    const state = createPokeState();
    applyPoke(state, 0.4, 0.4, 1);
    stepPoke(state, materialPresets.glass);
    const marked = state.smudge;

    releasePoke(state);
    for (let i = 0; i < 16; i += 1) {
      stepPoke(state, materialPresets.glass);
    }

    expect(marked).toBeGreaterThan(0);
    expect(state.smudge).toBeLessThan(marked);
    expect(getMaterialResponse(state, materialPresets.glass).smudge).toBe(
      state.smudge,
    );
  });
});

describe("grass and reduced motion", () => {
  it("generates deterministic blade/card instances", () => {
    const first = createGrassBladeInstances({ count: 24, seed: 5 });
    const again = createGrassBladeInstances({ count: 24, seed: 5 });

    expect(first).toHaveLength(24);
    expect(first).toEqual(again);
    expect(first[0]?.height).toBeGreaterThan(0);
  });

  it("keeps a low-power reduced-motion fallback", () => {
    expect(resolveReducedMotionSurface(true)).toEqual({
      reducedMotion: true,
      pressureScale: 0,
      bladeCountScale: 0.25,
    });
    expect(resolveGrassBladeCount(420, false)).toBe(420);
    expect(resolveGrassBladeCount(420, true)).toBe(105);
  });
});

describe("hot loop guard", () => {
  it("does not use React state in pointer/frame hot paths", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const hookSource = readFileSync(
      join(root, "../src/hooks/usePokeSurface.ts"),
      "utf8",
    );
    const componentSource = readFileSync(
      join(root, "../src/components/FeelableSurface.tsx"),
      "utf8",
    );
    const grassSource = readFileSync(
      join(root, "../src/components/GrassLogoSurface.tsx"),
      "utf8",
    );

    expect(hookSource).not.toContain("useState");
    expect(hookSource).not.toContain("setState");
    expect(componentSource).toContain("useFrame(poke.step)");
    expect(componentSource).not.toContain("useState");
    expect(componentSource).not.toContain("setState");
    expect(grassSource).toContain("resolveGrassBladeCount");
  });
});
