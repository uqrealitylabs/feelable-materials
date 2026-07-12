import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { act, create } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import {
  addContact,
  applyPoke,
  createContactHistory,
  createGrassBladeInstances,
  createPokeModel,
  createPokeState,
  createPokeUniforms,
  gaussianInfluence,
  getMaterialConfig,
  getMaterialEventKind,
  getMaterialHapticPattern,
  getMaterialKind,
  getMaterialPreset,
  getMaterialResponse,
  getPokeInfluence,
  isMaterialKind,
  materialConfigs,
  materialPresets,
  readPointerUv,
  releasePoke,
  resolveGrassBladeCount,
  resolveReducedMotionSurface,
  shouldTriggerMaterialHaptic,
  stepContactHistory,
  stepPoke,
  syncPokeUniforms,
  triggerMaterialHaptic,
  updatePokeModel,
} from "../src";
import {
  FeelableMaterialCard,
  FeelableSurface,
  GrassLogoSurface,
  usePointerUv,
  usePokeSurface,
  useReducedMotionSurface,
} from "../src/react";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock("@react-three/fiber", () => ({
  useFrame: vi.fn((callback: () => void) => callback()),
}));

describe("material presets", () => {
  it.each([
    ["cloth", "crease"],
    ["rubber", "squish"],
    ["glass", "smudge"],
    ["grass", "bend"],
    ["mail", "bend"],
    ["enamel", "smudge"],
  ] as const)("maps %s to %s behaviour", (kind, behavior) => {
    expect(materialPresets[kind]).toMatchObject({
      kind,
      behavior,
      pointerResponse: true,
    });
  });

  it("parses material kinds without app label coupling", () => {
    expect(isMaterialKind("glass")).toBe(true);
    expect(isMaterialKind("Glass")).toBe(true);
    expect(isMaterialKind("LinkedIn")).toBe(false);
    expect(getMaterialKind("glass")).toBe("glass");
    expect(getMaterialKind("Glass")).toBe("glass");
    expect(getMaterialKind("unknown-kind", "rubber")).toBe("rubber");
    expect(getMaterialKind("constructor")).toBe("cloth");
    expect(getMaterialConfig("mail")).toBe(materialConfigs.mail);
    expect(getMaterialConfig("unknown", "grass")).toBe(materialConfigs.grass);
    expect(getMaterialPreset(materialConfigs.enamel)).toBe(
      materialConfigs.enamel,
    );
  });
});

describe("pointer UV", () => {
  it("uses local UVs and falls back to center instead of fake world-space UVs", () => {
    expect(readPointerUv({ uv: { x: 0.2, y: 0.8 } })).toEqual({
      x: 0.2,
      y: 0.8,
    });
    expect(
      readPointerUv({
        currentTarget: { clientWidth: 100, clientHeight: 50 },
        nativeEvent: { offsetX: 25, offsetY: 10 },
      }),
    ).toEqual({ x: 0.25, y: 0.8 });
    expect(readPointerUv({})).toEqual({ x: 0.5, y: 0.5 });
  });
});

describe("poke model", () => {
  it("keeps pointer response local to the contact point", () => {
    const state = createPokeState();
    expect(createPokeModel()).toMatchObject({ x: 0.5, y: 0.5 });
    expect(gaussianInfluence(1, 0)).toBe(0);
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
    const marked = state.stains;

    releasePoke(state);
    for (let i = 0; i < 16; i += 1) {
      stepPoke(state, materialPresets.glass);
    }

    expect(marked).toBeGreaterThan(0);
    expect(state.stains).toBeLessThan(marked);
    expect(getMaterialResponse(materialPresets.glass, state).smudge).toBe(
      state.stains,
    );
    expect(
      getMaterialResponse(materialPresets.cloth, state).crease,
    ).toBeGreaterThan(0);
    expect(
      getMaterialResponse(materialPresets.grass, state).bend,
    ).toBeGreaterThan(0);
    expect(
      getMaterialResponse(materialPresets.mail, state).bend,
    ).toBeGreaterThan(0);
  });

  it("classifies events and keeps material-specific damage local", () => {
    const rubber = createPokeState();
    applyPoke(rubber, 0.1, 0.1, 1);
    applyPoke(rubber, 0.9, 0.9, 1);

    expect(getMaterialEventKind(materialPresets.rubber, rubber, 1)).toBe(
      "damage",
    );
    stepPoke(rubber, materialPresets.rubber);
    expect(rubber.scratches).toBe(1);
    expect(getMaterialResponse(materialPresets.rubber, rubber).scratch).toBe(
      true,
    );

    const grass = createPokeState();
    applyPoke(grass, 0.1, 0.1, 0.6);
    applyPoke(grass, 0.6, 0.1, 0.6);
    expect(getMaterialEventKind(materialPresets.grass, grass, 0.6)).toBe("cut");
    stepPoke(grass, materialPresets.grass);
    expect(grass.cuts).toBeGreaterThan(0);

    const glass = createPokeState();
    applyPoke(glass, 0.1, 0.1, 0.4);
    applyPoke(glass, 0.5, 0.1, 0.4);
    expect(getMaterialEventKind(materialPresets.glass, glass, 0.4)).toBe(
      "fastSwipe",
    );

    const cloth = createPokeState();
    applyPoke(cloth, 0.5, 0.5, 0.7);
    expect(getMaterialEventKind(materialPresets.cloth, cloth, 0.7)).toBe(
      "press",
    );
    expect(getMaterialEventKind(materialPresets.cloth, cloth, 0.2)).toBe(
      "contact",
    );
    expect(getMaterialEventKind(materialPresets.cloth, cloth, 0)).toBe("hover");
  });

  it("tracks contact history, generic updates, and haptic no-ops", () => {
    expect(createContactHistory()).toMatchObject({
      maxPoints: 8,
      fadeMs: 1400,
    });
    const history = createContactHistory({ maxPoints: 1, fadeMs: 20 });
    addContact(history, { x: 0.2, y: 0.4 }, 4, "press");
    addContact(history, { x: 0.8, y: 0.1 }, 0.5, "release");
    expect(history.points).toHaveLength(1);
    expect(history.points[0]).toMatchObject({
      x: 0.8,
      y: 0.1,
      strength: 0.5,
    });
    stepContactHistory(history, 21);
    expect(history.points).toHaveLength(0);

    const state = createPokeState();
    updatePokeModel(state, materialPresets.mail, { x: 0.7, y: 0.4 }, 33.34);
    expect(state.pressure).toBeGreaterThan(0);
    updatePokeModel(
      state,
      materialPresets.mail,
      { x: 0.7, y: 0.4, active: false },
      16.67,
    );
    expect(state.targetPressure).toBe(0);
    updatePokeModel(state, materialPresets.mail, null);

    expect(shouldTriggerMaterialHaptic(100, 279)).toBe(false);
    expect(shouldTriggerMaterialHaptic(100, 281)).toBe(true);
    expect(getMaterialHapticPattern("glass", "contact", 0)).toEqual([]);
    expect(getMaterialHapticPattern("rubber", "press", 0.5)).toEqual([
      9, 13, 9,
    ]);
    expect(triggerMaterialHaptic("glass", "contact", 1, {})).toBe(false);
    expect(
      triggerMaterialHaptic("glass", "contact", 1, { reducedMotion: true }),
    ).toBe(false);
    const vibrate = vi.fn(() => true);
    expect(
      triggerMaterialHaptic("mail", "contact", 1, {
        navigator: { vibrate },
      }),
    ).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([10, 20, 10]);
    expect(
      triggerMaterialHaptic("glass", "damage", 1, {
        navigator: { vibrate },
      }),
    ).toBe(false);
    expect(
      triggerMaterialHaptic("mail", "contact", 1, {
        navigator: {
          vibrate: () => {
            throw new Error("blocked");
          },
        },
      }),
    ).toBe(false);
  });
});

describe("grass and reduced motion", () => {
  it("generates deterministic blade/card instances", () => {
    const first = createGrassBladeInstances({ count: 24, seed: 5 });
    const again = createGrassBladeInstances({ count: 24, seed: 5 });
    const defaultSeed = createGrassBladeInstances({ count: 1 });
    const defaultOptions = createGrassBladeInstances();
    const trueMask = createGrassBladeInstances({
      count: 2,
      seed: 1,
      mask: () => true,
    });
    const rejectingMask = createGrassBladeInstances({
      count: 2,
      seed: 1,
      mask: () => false,
    });

    expect(first).toHaveLength(24);
    expect(first).toEqual(again);
    expect(first[0]?.height).toBeGreaterThan(0);
    expect(defaultSeed).toHaveLength(1);
    expect(defaultOptions.length).toBe(materialPresets.grass.bladeCount);
    expect(trueMask).toHaveLength(2);
    expect(rejectingMask).toHaveLength(0);
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

describe("uniforms", () => {
  it("syncs poke uniforms and handles missing state", () => {
    const uniforms = createPokeUniforms();
    expect(syncPokeUniforms(uniforms, undefined)).toBe(uniforms);
    const state = createPokeState({
      x: 0.2,
      y: 0.7,
      pressure: 0.4,
      stains: 0.3,
    });

    expect(syncPokeUniforms(uniforms, state)).toMatchObject({
      uPoke: { value: [0.2, 0.7, 0.4] },
      uSmudge: { value: 0.3 },
    });
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

describe("React adapters", () => {
  it("renders card, surface, and grass components with shared poke state", () => {
    let surfaceRenderer: ReturnType<typeof create> | undefined;
    let cardRenderer: ReturnType<typeof create> | undefined;
    let grassRenderer: ReturnType<typeof create> | undefined;

    act(() => {
      surfaceRenderer = create(
        createElement(
          FeelableSurface,
          { material: "rubber", ariaLabel: "Rubber card" },
          createElement("meshBasicMaterial"),
        ),
      );
      cardRenderer = create(
        createElement(FeelableMaterialCard, {
          material: "cloth",
          ariaLabel: "Cloth card",
          underline: true,
          logo: createElement("mesh"),
        }),
      );
      create(
        createElement(FeelableMaterialCard, {
          material: "cloth",
          ariaLabel: "Plain cloth card",
        }),
      );
      grassRenderer = create(
        createElement(GrassLogoSurface, {
          ariaLabel: "Grass logo",
          count: 12,
          seed: 4,
          mask: (x: number) => x > 0.2,
        }),
      );
    });
    const surface = surfaceRenderer?.toJSON();
    const card = cardRenderer?.toJSON();
    const grass = grassRenderer?.toJSON();

    expect(JSON.stringify(surface)).toContain("Rubber card");
    expect(JSON.stringify(card)).toContain("feelableUnderline");
    expect(JSON.stringify(grass)).toContain("grassBlades");
  });

  it("keeps hook state in refs and resolves pointer/reduced-motion helpers", () => {
    const observed: unknown[] = [];

    function Host() {
      const poke = usePokeSurface("rubber");
      const reducedPoke = usePokeSurface("rubber", { reducedMotion: true });
      const readUv = usePointerUv();
      const reduced = useReducedMotionSurface(true);

      poke.handlers.onPointerMove({ uv: { x: 0.2, y: 0.3 } });
      poke.handlers.onPointerDown({ uv: { x: 0.4, y: 0.6 } });
      poke.step();
      poke.handlers.onPointerUp();
      poke.handlers.onPointerLeave();
      reducedPoke.handlers.onPointerDown({ uv: { x: 0.9, y: 0.9 } });
      observed.push({
        pressure: poke.stateRef.current.pressure,
        reducedPressure: reducedPoke.stateRef.current.targetPressure,
        uv: readUv({}),
        reduced,
      });
      return null;
    }

    act(() => {
      create(createElement(Host));
    });

    expect(observed.at(-1)).toMatchObject({
      pressure: expect.any(Number),
      reducedPressure: 0,
      uv: { x: 0.5, y: 0.5 },
      reduced: { reducedMotion: true },
    });
  });
});
