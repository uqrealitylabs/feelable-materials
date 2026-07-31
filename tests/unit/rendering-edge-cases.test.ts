import { createRequire } from "node:module";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  addContact,
  applyPoke,
  createContactHistory,
  createGrassBladeInstances,
  createPokeState,
  createPokeUniforms,
  gaussianInfluence,
  getMaterialHapticPattern,
  getMaterialKind,
  getPokeInfluence,
  getPokeVelocity,
  materialPresets,
  readPointerUv,
  releasePoke,
  resolveGrassBladeCount,
  shouldTriggerMaterialHaptic,
  stepContactHistory,
  stepPoke,
  triggerMaterialHaptic,
} from "../../src";
import {
  FeelableSurface,
  patchFeelableMaterial,
  patchFeelableMeshMaterials,
} from "../../src/components/FeelableSurface";
import {
  applyGrassBladeMatrices,
  GrassLogoSurface,
} from "../../src/components/GrassLogoSurface";
import { usePokeSurface } from "../../src/hooks/usePokeSurface";

const { ShaderLib } = createRequire(import.meta.url)("three") as {
  ShaderLib: Record<
    "basic" | "normal" | "standard" | "physical",
    { vertexShader: string; fragmentShader: string }
  >;
};

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const { frameCallbacks, invalidateMock, rendererMock } = vi.hoisted(() => ({
  frameCallbacks: [] as Array<(_state: unknown, delta: number) => void>,
  invalidateMock: vi.fn(),
  rendererMock: { isWebGLRenderer: true },
}));

vi.mock("@react-three/fiber", () => ({
  useFrame: vi.fn((callback: (_state: unknown, delta: number) => void) => {
    frameCallbacks.push(callback);
  }),
  useThree: vi.fn((select: (state: unknown) => unknown) =>
    select({ gl: rendererMock, invalidate: invalidateMock }),
  ),
}));

beforeEach(() => {
  frameCallbacks.length = 0;
  invalidateMock.mockClear();
  rendererMock.isWebGLRenderer = true;
});

describe("numeric and timing edge cases", () => {
  it.each([
    [{ uv: { x: Number.NaN, y: Number.POSITIVE_INFINITY } }, { x: 0.5, y: 1 }],
    [
      {
        currentTarget: { clientWidth: 0, clientHeight: -1 },
        nativeEvent: { offsetX: Number.NEGATIVE_INFINITY, offsetY: Number.NaN },
      },
      { x: 0.5, y: 0.5 },
    ],
    [
      {
        currentTarget: { clientWidth: 200, clientHeight: 100 },
        nativeEvent: { offsetX: 50, offsetY: 25 },
      },
      { x: 0.25, y: 0.75 },
    ],
    [
      { currentTarget: { clientWidth: 200, clientHeight: 100 } },
      { x: 0.5, y: 0.5 },
    ],
  ] as const)("normalizes invalid pointer input %#", (event, expected) => {
    expect(readPointerUv(event)).toEqual(expected);
  });

  it("sanitizes partial initial state", () => {
    expect(
      createPokeState({
        x: Number.NaN,
        y: Number.POSITIVE_INFINITY,
        previousX: Number.NaN,
        previousY: Number.NEGATIVE_INFINITY,
        pressure: Number.NEGATIVE_INFINITY,
        targetPressure: Number.POSITIVE_INFINITY,
        stains: Number.NaN,
        scratches: 1.5,
        cuts: -1,
      }),
    ).toMatchObject({
      x: 0.5,
      y: 1,
      previousX: 0.5,
      previousY: 0,
      pressure: 0,
      targetPressure: 1,
      stains: 0,
      scratches: 0,
      cuts: 0,
    });
  });

  it("falls back for malformed material names and non-positive strength", () => {
    expect(getMaterialKind(null as never, "mail")).toBe("mail");
    expect(getMaterialKind("unknown", "invalid" as never)).toBe("cloth");
    expect(gaussianInfluence(0, 1, -1)).toBe(0);
  });

  it.each(["cloth", "rubber", "grass"] as const)(
    "does not damage %s on first or hover-only contact",
    (kind) => {
      const state = createPokeState();
      applyPoke(state, 0, 0, 1);
      stepPoke(state, materialPresets[kind]);
      applyPoke(state, 1, 1, 0.25);
      stepPoke(state, materialPresets[kind]);
      expect(state.scratches).toBe(0);
      expect(state.cuts).toBe(0);
    },
  );

  it.each([
    ["rubber", 30],
    ["rubber", 60],
    ["rubber", 120],
    ["grass", 30],
    ["grass", 60],
    ["grass", 120],
  ] as const)("normalizes %s damage over time at %i Hz", (kind, hz) => {
    const state = simulateDamage(kind, hz);
    expect(kind === "grass" ? state.cuts : state.scratches).toBe(1);
  });

  it.each([30, 120])("keeps glass marks stable at %i Hz", (hz) => {
    const actual = simulateGlass(hz);
    const expected = simulateGlass(60);
    expect(actual[0]).toBeCloseTo(expected[0] ?? 0, 10);
    expect(actual[1]).toBeCloseTo(expected[1] ?? 0, 10);
  });

  it("allows zero pressure and zero elapsed time", () => {
    const state = createPokeState();
    applyPoke(state, 0.2, 0.3, 0);
    const velocity = stepPoke(state, materialPresets.glass, 0);
    expect(state.pressure).toBe(0);
    expect(state.stains).toBe(0);
    expect(velocity).toMatchObject({ x: 0, y: 0 });
    expect(getPokeVelocity(state, Number.NaN).perSecond).toBe(0);
    stepPoke(state, materialPresets.glass, Number.NaN);
  });

  it.each([0, -1, Number.NaN, Number.POSITIVE_INFINITY])(
    "returns zero influence for radius %s",
    (radius) => {
      expect(getPokeInfluence(createPokeState(), 0.5, 0.5, radius)).toBe(0);
    },
  );
});

describe("bounded grass generation", () => {
  it.each([
    [0, 0],
    [1, 1],
    [420, 420],
  ] as const)("accepts count %i", (count, expected) => {
    expect(resolveGrassBladeCount(count)).toBe(expected);
    expect(createGrassBladeInstances({ count })).toHaveLength(expected);
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 100_001])(
    "rejects unsafe count %s",
    (count) => {
      expect(() => resolveGrassBladeCount(count)).toThrow(RangeError);
      expect(() => createGrassBladeInstances({ count })).toThrow(RangeError);
    },
  );

  it.each([0.5, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects unsafe seed %s",
    (seed) => {
      expect(() => createGrassBladeInstances({ count: 1, seed })).toThrow(
        /seed/,
      );
    },
  );

  it.each([
    { maxPoints: -1 },
    { maxPoints: 0.5 },
    { maxPoints: 10_001 },
    { fadeMs: -1 },
    { fadeMs: Number.NaN },
  ])("rejects unsafe contact history options %#", (options) => {
    expect(() => createContactHistory(options)).toThrow(RangeError);
  });

  it("bounds contact data and ignores invalid elapsed time", () => {
    const history = createContactHistory({ maxPoints: 1, fadeMs: 10 });
    addContact(
      history,
      {
        x: Number.NEGATIVE_INFINITY,
        y: Number.POSITIVE_INFINITY,
        velocity: [Number.NaN, Number.POSITIVE_INFINITY],
      },
      Number.NaN,
      "contact",
    );
    stepContactHistory(history, Number.NaN);
    expect(history.points[0]).toMatchObject({
      uv: [0, 1],
      pressure: 0,
      velocity: [0, 0],
      age: 0,
    });
  });

  it("writes distinct instance transforms", () => {
    let values: number[] = [];
    const matrices: number[][] = [];
    const matrix = {
      set: (...next: number[]) => {
        values = next;
        return matrix;
      },
    };
    const mesh = {
      count: 0,
      matrix: { clone: () => matrix },
      instanceMatrix: { needsUpdate: false },
      setMatrixAt: (index: number) => {
        matrices[index] = [...values];
      },
    };
    const blades = createGrassBladeInstances({ count: 3, seed: 9 });

    applyGrassBladeMatrices(mesh, blades);

    expect(mesh.count).toBe(3);
    expect(mesh.instanceMatrix.needsUpdate).toBe(true);
    expect(matrices).toHaveLength(3);
    expect(matrices[0]).not.toEqual(matrices[1]);
    expect(matrices[0]?.[3]).toBeCloseTo((blades[0]?.x ?? 0) - 0.5);
    expect(matrices[0]?.[7]).toBeCloseTo((blades[0]?.y ?? 0) - 0.5);
  });
});

describe("browser adapter correctness", () => {
  it("calls vibration with its receiver and handles invalid timing/intensity", () => {
    const receiver = {
      vibrate(pattern: number | number[]) {
        expect(this).toBe(receiver);
        expect(pattern).toEqual([10, 20, 10]);
        return true;
      },
    };
    expect(
      triggerMaterialHaptic("mail", "contact", 1, { navigator: receiver }),
    ).toBe(true);
    expect(getMaterialHapticPattern("mail", "contact", Number.NaN)).toEqual([]);
    expect(shouldTriggerMaterialHaptic(10, 10, -1)).toBe(true);
  });

  it.each(["onPointerUp", "onPointerCancel", "onLostPointerCapture"] as const)(
    "releases active contact on %s",
    (handler) => {
      let poke: ReturnType<typeof usePokeSurface> | undefined;
      function Host() {
        poke = usePokeSurface("rubber");
        return null;
      }
      let renderer: ReactTestRenderer | undefined;
      act(() => {
        renderer = create(createElement(Host));
      });
      const target = {
        setPointerCapture: vi.fn(),
        releasePointerCapture: vi.fn(),
      };
      act(() => {
        poke?.handlers.onPointerDown({
          uv: { x: 0.1, y: 0.2 },
          pointerId: 7,
          target,
        });
        poke?.handlers.onPointerMove({
          uv: { x: 0.4, y: 0.5 },
          pointerId: 7,
        });
      });
      expect(poke?.stateRef.current.targetPressure).toBe(1);
      act(() => poke?.handlers[handler]({ pointerId: 7 }));
      expect(poke?.stateRef.current.active).toBe(false);
      expect(target.releasePointerCapture).toHaveBeenCalledWith(7);
      act(() => renderer?.unmount());
    },
  );

  it.each(["rubber", "glass"] as const)(
    "claims %s pointer events and drives demand frames to rest",
    (material) => {
      let poke: ReturnType<typeof usePokeSurface> | undefined;
      function Host() {
        poke = usePokeSurface(material);
        return null;
      }
      let renderer: ReactTestRenderer | undefined;
      act(() => {
        renderer = create(createElement(Host));
      });
      const stopPropagation = vi.fn();
      act(() => {
        poke?.handlers.onPointerDown({
          uv: { x: 0.4, y: 0.6 },
          stopPropagation,
        });
        poke?.handlers.onPointerMove({
          uv: { x: 0.5, y: 0.6 },
          stopPropagation,
        });
      });
      expect(stopPropagation).toHaveBeenCalledTimes(2);
      expect(invalidateMock).toHaveBeenCalled();

      expect(runDemandFrames(() => poke?.step())).toBeLessThan(1_000);
      act(() =>
        poke?.handlers.onPointerUp({
          stopPropagation,
        }),
      );
      expect(runDemandFrames(() => poke?.step())).toBeLessThan(1_000);
      expect(poke?.stateRef.current).toMatchObject({
        active: false,
        pressure: 0,
        stains: 0,
      });
      act(() => renderer?.unmount());
    },
  );

  it.each(["hoverPressure", "pressPressure"] as const)(
    "stops glass demand frames when %s is zero",
    (option) => {
      let poke: ReturnType<typeof usePokeSurface> | undefined;
      function Host() {
        poke = usePokeSurface(
          "glass",
          option === "hoverPressure"
            ? { hoverPressure: 0 }
            : { pressPressure: 0 },
        );
        return null;
      }
      let renderer: ReactTestRenderer | undefined;
      act(() => {
        renderer = create(createElement(Host));
      });
      act(() => {
        poke?.handlers[
          option === "hoverPressure" ? "onPointerDown" : "onPointerMove"
        ]({ uv: { x: 0.4, y: 0.5 } });
        poke?.step();
        poke?.handlers.onPointerUp();
        poke?.step();
        poke?.handlers[
          option === "hoverPressure" ? "onPointerMove" : "onPointerDown"
        ]({ uv: { x: 0.5, y: 0.5 } });
      });
      expect(poke?.stateRef.current.targetPressure).toBe(0);
      expect(poke?.stateRef.current.stains).toBeGreaterThan(0);
      expect(runDemandFrames(() => poke?.step())).toBeLessThan(1_000);
      expect(poke?.stateRef.current).toMatchObject({ pressure: 0, stains: 0 });
      act(() => renderer?.unmount());
    },
  );

  it.each([
    ["glass", "cloth"],
    ["grass", "mail"],
    ["rubber", "glass"],
  ] as const)("clears %s history when switching to %s", (from, to) => {
    let poke: ReturnType<typeof usePokeSurface> | undefined;
    function Host({ material }: { material: typeof from | typeof to }) {
      poke = usePokeSurface(material, {
        initialState: { stains: 1, scratches: 2, cuts: 3 },
      });
      return null;
    }
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(createElement(Host, { material: from }));
    });
    expect(poke?.stateRef.current).toMatchObject({
      stains: 1,
      scratches: 2,
      cuts: 3,
    });
    act(() => renderer?.update(createElement(Host, { material: to })));
    expect(poke?.stateRef.current).toMatchObject({
      stains: 0,
      scratches: 0,
      cuts: 0,
    });
    expect(poke?.uniformsRef.current.uSmudge.value).toBe(0);
    act(() => renderer?.unmount());
  });

  it("isolates pointers, capture failures, leave fallback, and reduced motion", () => {
    let poke: ReturnType<typeof usePokeSurface> | undefined;
    function Host({ reducedMotion = false }: { reducedMotion?: boolean }) {
      poke = usePokeSurface("rubber", { reducedMotion });
      return null;
    }
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(createElement(Host));
    });
    const throwingTarget = {
      setPointerCapture: () => {
        throw new Error("capture failed");
      },
      releasePointerCapture: () => {
        throw new Error("capture already lost");
      },
    };
    act(() => {
      poke?.handlers.onPointerDown({
        uv: { x: 0.1, y: 0.2 },
        pointerId: 1,
        target: throwingTarget,
      });
      poke?.handlers.onPointerDown({
        uv: { x: 0.9, y: 0.9 },
        pointerId: 2,
      });
      poke?.handlers.onPointerMove({
        uv: { x: 0.8, y: 0.8 },
        pointerId: 2,
      });
      poke?.handlers.onPointerMove({ uv: { x: 0.7, y: 0.7 } });
      poke?.handlers.onPointerUp({ pointerId: 2 });
    });
    expect(poke?.stateRef.current).toMatchObject({
      x: 0.1,
      y: 0.2,
      active: true,
    });
    act(() => poke?.handlers.onPointerLeave({ pointerId: 1 }));
    expect(poke?.stateRef.current.active).toBe(false);

    const captured = {
      setPointerCapture: vi.fn(),
      releasePointerCapture: () => {
        throw new Error("capture already lost");
      },
    };
    act(() => {
      poke?.handlers.onPointerDown({
        uv: { x: 0.3, y: 0.4 },
        pointerId: 3,
        target: captured,
      });
      poke?.handlers.onPointerLeave({ pointerId: 3 });
      poke?.step();
    });
    expect(poke?.stateRef.current.active).toBe(true);
    expect(poke?.stateRef.current.pressure).toBeGreaterThan(0);

    act(() => {
      renderer?.update(createElement(Host, { reducedMotion: true }));
    });
    expect(poke?.stateRef.current).toMatchObject({
      active: false,
      pressure: 0,
    });
    act(() => {
      poke?.handlers.onPointerDown({
        pointerId: 4,
        target: captured,
      });
      poke?.handlers.onPointerMove({ uv: { x: 0.9, y: 0.9 } });
    });
    expect(captured.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(poke?.step()).toBe(poke?.stateRef.current);
    act(() => renderer?.unmount());
  });
});

describe("actual render adapters", () => {
  it.each(["basic", "standard", "physical"] as const)(
    "injects valid %s material shader symbols",
    (kind) => {
      const material = materialStub();
      const uniforms = feelableUniforms();
      const cleanup = patchFeelableMaterial(material, uniforms);
      const shader = shaderFor(kind);

      material.onBeforeCompile(shader, {});

      expect(material.original).toHaveBeenCalled();
      expect(shader.uniforms).toMatchObject({
        uFeelablePoke: uniforms.uFeelablePoke,
      });
      expect(shader.vertexShader).toContain("instanceMatrix[3].xy");
      expect(shader.vertexShader).toContain("transformed -= normal *");
      expect(shader.vertexShader).not.toContain(
        "transformed -= objectNormal *",
      );
      expect(shader.fragmentShader).toContain("feelableContact");
      expect(shader.fragmentShader).toContain(
        "feelableMark = exp(-pow(feelableDistance",
      );
      expect(shader.fragmentShader).toContain("feelableMark * 0.18");
      expect(shader.fragmentShader).toContain("feelableRelief * 0.35");
      uniforms.uFeelableRadius.value = 0.9;
      expect((shader.uniforms.uFeelableRadius as { value: number }).value).toBe(
        0.9,
      );
      expect(() => patchFeelableMaterial(material, uniforms)).toThrow(
        /already owned/,
      );
      cleanup();
      expect(material.onBeforeCompile).toBe(material.original);
      cleanup();
    },
  );

  it("deforms normal materials without requiring a colour chunk", () => {
    const material = materialStub();
    const cleanup = patchFeelableMaterial(material, feelableUniforms());
    const shader = shaderFor("normal");
    material.onBeforeCompile(shader, {});
    expect(shader.vertexShader).toContain("feelableInfluence");
    expect(shader.fragmentShader).not.toContain("feelableContact");
    cleanup();
  });

  it("leaves fragment-only shaders untouched to avoid an invalid varying", () => {
    const material = materialStub();
    const cleanup = patchFeelableMaterial(material, feelableUniforms());
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: "main",
      fragmentShader: ShaderLib.basic.fragmentShader,
    };
    material.onBeforeCompile(shader, {});
    expect(shader.vertexShader).toBe("main");
    expect(shader.fragmentShader).toBe(ShaderLib.basic.fragmentShader);
    expect(shader.uniforms).toEqual({});
    cleanup();
  });

  it("leaves unsupported shaders untouched", () => {
    const material = materialStub();
    const abandon = patchFeelableMaterial(material, feelableUniforms());
    const untouched = {
      uniforms: {},
      vertexShader: "main",
      fragmentShader: "main",
    };
    material.onBeforeCompile(untouched, {});
    expect(untouched.uniforms).toEqual({});
    material.onBeforeCompile = vi.fn();
    abandon();
  });

  it("preserves distinct consumer shader cache keys", () => {
    const first = materialStub();
    const second = materialStub();
    first.onBeforeCompile = function firstHook() {};
    second.onBeforeCompile = function secondHook() {};
    const firstKey = first.onBeforeCompile.toString();
    const secondKey = second.onBeforeCompile.toString();
    expect(firstKey).not.toBe(secondKey);
    const cleanupFirst = patchFeelableMaterial(first, feelableUniforms());
    const cleanupSecond = patchFeelableMaterial(second, feelableUniforms());
    expect(first.onBeforeCompile.toString()).toContain(firstKey);
    expect(second.onBeforeCompile.toString()).toContain(secondKey);
    expect(first.onBeforeCompile.toString()).not.toBe(
      second.onBeforeCompile.toString(),
    );
    cleanupFirst();
    cleanupSecond();
  });

  it("rejects cross-surface sharing and releases material ownership", () => {
    const shared = materialStub();
    const cleanupA = patchFeelableMeshMaterials(
      { material: shared, geometry: geometryStub() },
      feelableUniforms(),
    );
    expect(shared.onBeforeCompile).not.toBe(shared.original);
    expect(() =>
      patchFeelableMeshMaterials(
        { material: shared, geometry: geometryStub() },
        feelableUniforms(materialPresets.cloth),
      ),
    ).toThrow(/cannot be shared/);
    cleanupA();
    const cleanupB = patchFeelableMeshMaterials(
      { material: shared, geometry: geometryStub() },
      feelableUniforms(materialPresets.cloth),
    );
    cleanupB();
    expect(shared.onBeforeCompile).toBe(shared.original);
  });

  it("keeps nested surfaces isolated", () => {
    const outer = materialStub();
    const inner = materialStub();
    const cleanup = patchFeelableMeshMaterials(
      {
        material: outer,
        geometry: geometryStub(),
        children: [
          { material: inner, userData: { feelableMaterial: "cloth" } },
        ],
      },
      feelableUniforms(),
    );
    expect(outer.onBeforeCompile).not.toBe(outer.original);
    expect(inner.onBeforeCompile).toBe(inner.original);
    cleanup();
  });

  it.each(["position", "normal", "uv"] as const)(
    "rejects geometry without a %s attribute",
    (attribute) => {
      const geometry = geometryStub();
      delete geometry.attributes[attribute];
      expect(() =>
        patchFeelableMeshMaterials(
          { material: materialStub(), geometry },
          feelableUniforms(),
        ),
      ).toThrow(/position, normal, and UV/);
    },
  );

  it("rejects renderers that bypass onBeforeCompile", () => {
    rendererMock.isWebGLRenderer = false;
    expect(() => {
      act(() => {
        create(
          createElement(
            FeelableSurface,
            { material: "cloth" },
            createElement("meshBasicMaterial"),
          ),
        );
      });
    }).toThrow(/WebGLRenderer/);
  });

  it("patches material identity once, updates config, and invalidates frames", () => {
    const first = materialStub();
    const second = materialStub();
    const nodes: Array<{ material?: unknown; geometry?: unknown }> = [
      { material: first, geometry: geometryStub() },
      {
        material: [first, { isMaterial: false }, second],
        geometry: geometryStub(),
      },
      { material: { isMaterial: false } },
      {},
    ];
    const mesh: { children: typeof nodes } = {
      children: nodes,
    };
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        createElement(
          FeelableSurface,
          {
            material: "rubber",
            meshProps: { castShadow: true, name: "test-surface" },
          },
          createElement("meshBasicMaterial"),
        ),
        { createNodeMock: () => mesh },
      );
    });
    act(() => frameCallbacks.at(-1)?.({}, 0.01667));
    expect(first.onBeforeCompile).not.toBe(first.original);
    expect(second.onBeforeCompile).not.toBe(second.original);
    expect(nodes[0]?.material).toBe(first);
    expect(renderer?.root.findByType("mesh").props).toMatchObject({
      castShadow: true,
      name: "test-surface",
    });
    const patched = first.onBeforeCompile;
    first.color = "blue";
    act(() => {
      renderer?.update(
        createElement(
          FeelableSurface,
          { material: "rubber" },
          createElement("meshBasicMaterial", { color: "blue" }),
        ),
      );
    });
    act(() => frameCallbacks.at(-1)?.({}, 0.01667));
    expect(first.onBeforeCompile).toBe(patched);
    expect(first.color).toBe("blue");
    act(() =>
      renderer?.root.findByType("mesh").props.onPointerDown({
        uv: { x: 0.5, y: 0.5 },
      }),
    );
    invalidateMock.mockClear();
    act(() => frameCallbacks[0]?.({}, 0.01667));
    expect(invalidateMock).toHaveBeenCalled();
    const replacement = materialStub();
    mesh.children = [{ material: replacement, geometry: geometryStub() }];
    act(() => {
      renderer?.update(
        createElement(
          FeelableSurface,
          { material: "rubber" },
          createElement("meshStandardMaterial"),
        ),
      );
      frameCallbacks.at(-1)?.({}, 0.01667);
    });
    expect(first.onBeforeCompile).toBe(first.original);
    expect(second.onBeforeCompile).toBe(second.original);
    expect(replacement.onBeforeCompile).not.toBe(replacement.original);
    const consumerHook = vi.fn(
      (_shader: ReturnType<typeof shaderFor>, _renderer: unknown) => undefined,
    );
    replacement.onBeforeCompile = consumerHook;
    act(() => frameCallbacks.at(-1)?.({}, 0.01667));
    expect(replacement.onBeforeCompile).not.toBe(consumerHook);
    act(() => {
      renderer?.update(
        createElement(
          FeelableSurface,
          { material: "cloth" },
          createElement("meshStandardMaterial"),
        ),
      );
      frameCallbacks.at(-1)?.({}, 0.01667);
    });
    const shader = shaderFor("basic");
    replacement.onBeforeCompile(shader, {});
    expect(consumerHook).toHaveBeenCalled();
    expect((shader.uniforms.uFeelableRadius as { value: number }).value).toBe(
      materialPresets.cloth.radius,
    );
    act(() => renderer?.unmount());
    expect(replacement.onBeforeCompile).toBe(consumerHook);
  });

  it("configures grass instance matrices through the rendered ref", () => {
    let values: number[] = [];
    const matrices: number[][] = [];
    const matrix = {
      set: (...next: number[]) => {
        values = next;
        return matrix;
      },
    };
    const instance = {
      count: 0,
      matrix: { clone: () => matrix },
      instanceMatrix: { needsUpdate: false },
      setMatrixAt: (index: number) => {
        matrices[index] = [...values];
      },
    };
    const surface = { userData: {}, traverse: () => undefined };
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        createElement(GrassLogoSurface, { count: 4, seed: 3 }),
        {
          createNodeMock: (element) =>
            element.type === "instancedMesh" ? instance : surface,
        },
      );
    });
    expect(matrices).toHaveLength(4);
    expect(instance.instanceMatrix.needsUpdate).toBe(true);
    renderer?.root.findByType("instancedMesh").props.raycast();
    act(() => renderer?.unmount());
  });
});

function simulateGlass(hz: number) {
  const state = createPokeState();
  applyPoke(state, 0.5, 0.5, 1);
  for (let step = 0; step < hz / 10; step += 1)
    stepPoke(state, materialPresets.glass, 1000 / hz);
  const marked = state.stains;
  releasePoke(state);
  for (let step = 0; step < hz; step += 1)
    stepPoke(state, materialPresets.glass, 1000 / hz);
  return [marked, state.stains];
}

function runDemandFrames(step: () => unknown) {
  let frames = 0;
  do {
    invalidateMock.mockClear();
    act(() => {
      step();
    });
    frames += 1;
  } while (invalidateMock.mock.calls.length > 0 && frames < 1_000);
  return frames;
}

function simulateDamage(kind: "rubber" | "grass", hz: number) {
  const state = createPokeState();
  const frames = hz / 30;
  const distance = kind === "grass" ? 0.72 : 0.84;
  applyPoke(state, 0.05, 0.5, 1);
  stepPoke(state, materialPresets[kind], 1000 / hz);
  for (let frame = 1; frame <= frames; frame += 1) {
    applyPoke(state, 0.05 + (distance * frame) / frames, 0.5, 1);
    stepPoke(state, materialPresets[kind], 1000 / hz);
  }
  return state;
}

function feelableUniforms(config = materialPresets.rubber) {
  const poke = createPokeUniforms(
    createPokeState({ x: 0.2, y: 0.3, pressure: 0.8 }),
  );
  return {
    uFeelablePoke: poke.uPoke,
    uFeelableRadius: { value: config.radius },
    uFeelableDepth: { value: config.deformation * 0.12 },
    uFeelableTint: { value: (1 - config.roughness) * 0.35 },
    uFeelableSmudge: poke.uSmudge,
  };
}

function shaderFor(kind: "basic" | "normal" | "standard" | "physical") {
  return {
    uniforms: {} as Record<string, unknown>,
    vertexShader: ShaderLib[kind].vertexShader,
    fragmentShader: ShaderLib[kind].fragmentShader,
  };
}

type MaterialStub = {
  isMaterial: true;
  needsUpdate: boolean;
  onBeforeCompile: (
    shader: ReturnType<typeof shaderFor>,
    renderer: unknown,
  ) => void;
  color?: string;
  original: ReturnType<typeof vi.fn>;
};

function materialStub(): MaterialStub {
  const original = vi.fn(
    (_shader: ReturnType<typeof shaderFor>, _renderer: unknown) => undefined,
  );
  return {
    isMaterial: true,
    needsUpdate: false,
    onBeforeCompile: original,
    original,
  };
}

function geometryStub() {
  return { attributes: { position: {}, normal: {}, uv: {} } };
}
