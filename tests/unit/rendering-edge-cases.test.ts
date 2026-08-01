import { createRequire } from "node:module";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { ObjectSpaceNormalMap } from "three";
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
    | "basic"
    | "lambert"
    | "matcap"
    | "normal"
    | "phong"
    | "physical"
    | "standard"
    | "toon",
    { vertexShader: string; fragmentShader: string }
  >;
};

const shaderCases = [
  ["basic", false, false],
  ["normal", true, false],
  ["lambert", true, false],
  ["matcap", true, false],
  ["phong", true, false],
  ["toon", true, false],
  ["standard", true, true],
  ["physical", true, true],
] as const;

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const {
  eventTargetMock,
  frameCallbacks,
  invalidateMock,
  nativePointerHandlers,
  rendererMock,
} = vi.hoisted(() => {
  const nativePointerHandlers = new Map<
    string,
    (event: { pointerId: number }) => void
  >();
  const eventTargetMock = {
    addEventListener: vi.fn(
      (type: string, handler: (event: { pointerId: number }) => void) =>
        nativePointerHandlers.set(type, handler),
    ),
    removeEventListener: vi.fn(
      (type: string, handler: (event: { pointerId: number }) => void) => {
        if (nativePointerHandlers.get(type) === handler)
          nativePointerHandlers.delete(type);
      },
    ),
  };
  return {
    eventTargetMock,
    frameCallbacks: [] as Array<(_state: unknown, delta: number) => void>,
    invalidateMock: vi.fn(),
    nativePointerHandlers,
    rendererMock: { domElement: eventTargetMock, isWebGLRenderer: true },
  };
});

vi.mock("@react-three/fiber", () => ({
  useFrame: vi.fn((callback: (_state: unknown, delta: number) => void) => {
    frameCallbacks.push(callback);
  }),
  useThree: vi.fn((select: (state: unknown) => unknown) =>
    select({
      events: { connected: eventTargetMock },
      gl: rendererMock,
      invalidate: invalidateMock,
    }),
  ),
}));

beforeEach(() => {
  frameCallbacks.length = 0;
  invalidateMock.mockClear();
  nativePointerHandlers.clear();
  eventTargetMock.addEventListener.mockClear();
  eventTargetMock.removeEventListener.mockClear();
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

  it.each([30, 60, 120])("keeps glass marks stable at %i Hz", (hz) => {
    const actual = simulateGlass(hz);
    const expected = simulateGlass(60);
    expect(actual[0]).toBeCloseTo(expected[0] ?? 0, 10);
    expect(actual[1]).toBeCloseTo(expected[1] ?? 0, 10);
  });

  it.each([30, 60, 120])("does not stain glass on hover at %i Hz", (hz) => {
    const state = createPokeState();
    applyPoke(state, 0.2, 0.8, 0.25);
    for (let frame = 0; frame < hz; frame += 1)
      stepPoke(state, materialPresets.glass, 1000 / hz);
    expect(state.stains).toBe(0);
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

  it.each([0, 0.5, 1, 2])(
    "matches the rendered Gaussian at %s radii",
    (distance) => {
      const state = createPokeState({ x: 0, y: 0, pressure: 1 });
      expect(getPokeInfluence(state, distance, 0, 1)).toBeCloseTo(
        Math.exp(-(distance * distance) * 2.4),
      );
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

  it.each([1, 9, 17])(
    "writes rooted upright transforms for seed %i",
    (seed) => {
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
      const blades = createGrassBladeInstances({ count: 64, seed });

      applyGrassBladeMatrices(mesh, blades);

      expect(mesh.count).toBe(64);
      expect(mesh.instanceMatrix.needsUpdate).toBe(true);
      expect(matrices).toHaveLength(64);
      expect(matrices[0]).not.toEqual(matrices[1]);
      expect(matrices[0]?.[3]).toBeCloseTo((blades[0]?.x ?? 0) - 0.5);
      expect(matrices[0]?.[7]).toBeCloseTo((blades[0]?.y ?? 0) - 0.5);
      for (const [index, matrixValues] of matrices.entries()) {
        const blade = blades[index];
        expect(matrixValues.every(Number.isFinite)).toBe(true);
        expect(matrixValues[11] - (matrixValues[9] ?? 0) / 2).toBeCloseTo(0);
        expect(matrixValues[11] + (matrixValues[9] ?? 0) / 2).toBeCloseTo(
          blade?.height ?? 0,
        );
        expect(matrixValues[8]).toBe(0);
        expect(
          Math.hypot(matrixValues[2] ?? 0, matrixValues[6] ?? 0),
        ).toBeCloseTo(1.2 - (blade?.stiffness ?? 0));
        expect(
          (matrixValues[9] ?? 0) *
            ((matrixValues[2] ?? 0) * (matrixValues[4] ?? 0) -
              (matrixValues[0] ?? 0) * (matrixValues[6] ?? 0)),
        ).toBeGreaterThan(0);
      }
      expect(
        new Set(
          blades.map(({ angle }) =>
            angle < -Math.PI / 2
              ? 0
              : angle < 0
                ? 1
                : angle < Math.PI / 2
                  ? 2
                  : 3,
          ),
        ).size,
      ).toBe(4);
    },
  );

  it.each([180, 420, 720])(
    "keeps every %i-blade footprint inside its field",
    (count) => {
      const mask = (x: number, y: number) =>
        x > 0.04 && x < 0.96 && y > 0.08 && y < 0.92;
      for (const seed of [1, 9, 17, Number.MAX_SAFE_INTEGER])
        for (const fieldMask of [undefined, mask]) {
          const blades = createGrassBladeInstances({
            count,
            seed,
            mask: fieldMask,
          });
          const contains =
            fieldMask ??
            ((x: number, y: number) => x >= 0 && x <= 1 && y >= 0 && y <= 1);
          expect(blades).toHaveLength(count);
          expect(
            blades.every(({ x, y, width, angle }) => {
              const dx = (Math.cos(angle) * width) / 2;
              const dy = (Math.sin(angle) * width) / 2;
              return (
                contains(x, y) &&
                contains(x - dx, y - dy) &&
                contains(x + dx, y + dy)
              );
            }),
          ).toBe(true);
        }
    },
  );
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

  it.each(["pointercancel", "lostpointercapture"] as const)(
    "releases active contact on native %s",
    (event) => {
      let poke: ReturnType<typeof usePokeSurface> | undefined;
      function Host() {
        poke = usePokeSurface("rubber");
        return null;
      }
      let renderer: ReactTestRenderer | undefined;
      act(() => {
        renderer = create(createElement(Host));
      });
      act(() => {
        poke?.handlers.onPointerDown({ pointerId: 7 });
      });
      act(() => nativePointerHandlers.get(event)?.({ pointerId: 8 }));
      expect(poke?.stateRef.current.active).toBe(true);
      act(() => nativePointerHandlers.get(event)?.({ pointerId: 7 }));
      expect(poke?.stateRef.current.active).toBe(false);
      act(() => renderer?.unmount());
      expect(eventTargetMock.removeEventListener).toHaveBeenCalledWith(
        event,
        expect.any(Function),
      );
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

      expect(runDemandFrames(() => poke?.step())).toBeLessThanOrEqual(120);
      act(() =>
        poke?.handlers.onPointerUp({
          stopPropagation,
        }),
      );
      expect(runDemandFrames(() => poke?.step())).toBeLessThanOrEqual(120);
      expect(poke?.stateRef.current).toMatchObject({
        active: false,
        pressure: 0,
        stains: 0,
      });
      act(() => renderer?.unmount());
    },
  );

  it.each([
    ["hoverPressure", "onPointerMove"],
    ["pressPressure", "onPointerDown"],
  ] as const)("does not mark glass when %s is zero", (option, handler) => {
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
      poke?.handlers[handler]({ uv: { x: 0.4, y: 0.5 } });
      poke?.step();
    });
    expect(poke?.stateRef.current.targetPressure).toBe(0);
    expect(poke?.stateRef.current.stains).toBe(0);
    expect(runDemandFrames(() => poke?.step())).toBeLessThanOrEqual(120);
    expect(poke?.stateRef.current).toMatchObject({ pressure: 0, stains: 0 });
    act(() => renderer?.unmount());
  });

  it.each(["glass", "rubber", "grass"] as const)(
    "keeps custom high hover pressure non-destructive for %s",
    (material) => {
      let poke: ReturnType<typeof usePokeSurface> | undefined;
      function Host() {
        poke = usePokeSurface(material, { hoverPressure: 1 });
        return null;
      }
      let renderer: ReactTestRenderer | undefined;
      act(() => {
        renderer = create(createElement(Host));
      });
      act(() => {
        poke?.handlers.onPointerMove({ uv: { x: 0, y: 0 } });
        poke?.step();
        poke?.handlers.onPointerMove({ uv: { x: 1, y: 1 } });
        poke?.step();
      });
      expect(poke?.stateRef.current).toMatchObject({
        targetPressure: 0.55,
        stains: 0,
        scratches: 0,
        cuts: 0,
      });
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
    const stopPropagation = vi.fn();
    act(() => poke?.handlers.onPointerLeave({ pointerId: 1, stopPropagation }));
    expect(stopPropagation).toHaveBeenCalledOnce();
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
      const foreignLeave = vi.fn();
      poke?.handlers.onPointerLeave({
        pointerId: 4,
        stopPropagation: foreignLeave,
      });
      expect(foreignLeave).not.toHaveBeenCalled();
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
      const stopPropagation = vi.fn();
      poke?.handlers.onPointerDown({
        pointerId: 4,
        target: captured,
        stopPropagation,
      });
      poke?.handlers.onPointerMove({
        uv: { x: 0.9, y: 0.9 },
        stopPropagation,
      });
      poke?.handlers.onPointerUp({ pointerId: 4, stopPropagation });
      expect(stopPropagation).not.toHaveBeenCalled();
    });
    expect(captured.setPointerCapture).toHaveBeenCalledTimes(1);
    expect(poke?.step()).toBe(poke?.stateRef.current);
    act(() => renderer?.unmount());
  });
});

describe("actual render adapters", () => {
  it.each(shaderCases)(
    "injects valid %s material shader symbols",
    (kind, hasNormals, hasRoughness) => {
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
      expect(shader.vertexShader).toContain("uFeelableBladeField > 0.5");
      expect(shader.vertexShader).toContain("mix(1.0, 0.24");
      expect(shader.vertexShader).toContain(
        "transformed -= normalize(feelableDirection) *",
      );
      expect(shader.vertexShader.includes("defined(USE_ENVMAP)")).toBe(
        !hasNormals,
      );
      expect(
        shader.vertexShader.includes(
          "#if defined(USE_MORPHNORMALS) && !defined(USE_ENVMAP)",
        ),
      ).toBe(kind === "basic");
      expect(shader.vertexShader.indexOf("transformed -=")).toBeGreaterThan(
        shader.vertexShader.indexOf("#include <skinning_vertex>"),
      );
      expect(shader.vertexShader.indexOf("transformed -=")).toBeLessThan(
        shader.vertexShader.indexOf("#include <project_vertex>"),
      );
      expect(shader.vertexShader).not.toContain("feelableWrinkle");
      expect(shader.vertexShader).not.toMatch(/;#define/);
      expect(shader.fragmentShader).not.toMatch(/;#define/);
      expect(shader.vertexShader).not.toContain(
        "transformed -= objectNormal *",
      );
      expect(shader.fragmentShader.includes("feelableNormalMix")).toBe(
        hasNormals,
      );
      expect(shader.fragmentShader.includes("roughnessFactor = mix")).toBe(
        hasRoughness,
      );
      expect(
        shader.fragmentShader.includes("vFeelableUv - uFeelableSmudgePosition"),
      ).toBe(hasRoughness);
      expect(
        shader.fragmentShader.match(/float feelableGaussian = exp/g)?.length ??
          0,
      ).toBe(hasNormals || hasRoughness ? 1 : 0);
      expect(shader.fragmentShader).not.toContain("diffuseColor.rgb = mix");
      expect(shader.fragmentShader.includes("tbn = getTangentFrame")).toBe(
        hasNormals,
      );
      expect(shader.fragmentShader.includes("vTangent - normal * dot")).toBe(
        hasNormals,
      );
      expect(shader.fragmentShader.includes("fwidth(feelableWeaveUv.x)")).toBe(
        hasNormals,
      );
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

  it("patches unlit shaders without Three's optional normal pipeline", () => {
    const material = materialStub();
    const cleanup = patchFeelableMaterial(material, feelableUniforms());
    const shader = {
      uniforms: {} as Record<string, unknown>,
      vertexShader: "#include <begin_vertex>\n#include <project_vertex>",
      fragmentShader: ShaderLib.basic.fragmentShader,
    };
    material.onBeforeCompile(shader, {});
    expect(shader.vertexShader).toContain("feelableDirection = normal");
    expect(shader.uniforms).toHaveProperty("uFeelablePoke");
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

  it.each(["ownership", "dynamic compile"] as const)(
    "rejects object-space normal maps during %s",
    (phase) => {
      const material = materialStub();
      if (phase === "ownership") {
        material.normalMap = {};
        material.normalMapType = ObjectSpaceNormalMap;
        expect(() =>
          patchFeelableMaterial(material, feelableUniforms()),
        ).toThrow(/object-space/);
        return;
      }
      const cleanup = patchFeelableMaterial(material, feelableUniforms());
      material.normalMap = {};
      material.normalMapType = ObjectSpaceNormalMap;
      expect(() => material.onBeforeCompile(shaderFor("physical"), {})).toThrow(
        /object-space/,
      );
      cleanup();
    },
  );

  it.each([
    ["valid first", false],
    ["rejected first", true],
  ])(
    "keeps multi-material ownership atomic with %s",
    (_order, rejectedFirst) => {
      const valid = materialStub();
      const rejected = materialStub();
      rejected.normalMap = {};
      rejected.normalMapType = ObjectSpaceNormalMap;
      expect(() =>
        patchFeelableMeshMaterials(
          {
            material: rejectedFirst ? [rejected, valid] : [valid, rejected],
            geometry: geometryStub(),
          },
          feelableUniforms(),
        ),
      ).toThrow(/object-space/);
      for (const material of [valid, rejected]) {
        expect(material.onBeforeCompile).toBe(material.original);
        expect(material.needsUpdate).toBe(false);
      }
    },
  );

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
    ).toThrow(/already owned/);
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
      ).toThrow(/position\/normal\/UV/);
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
    expect((shader.uniforms.uFeelableWeave as { value: number }).value).toBe(1);
    act(() => {
      renderer?.update(
        createElement(
          FeelableSurface,
          { material: "enamel" },
          createElement("meshPhysicalMaterial"),
        ),
      );
      frameCallbacks.at(-1)?.({}, 0.01667);
    });
    expect(
      (shader.uniforms.uFeelableContactRoughness as { value: number }).value,
    ).toBe(1);
    act(() => renderer?.unmount());
    expect(replacement.onBeforeCompile).toBe(consumerHook);
  });

  it("recovers from an invalid dynamic material replacement", () => {
    const report = vi.spyOn(console, "error").mockImplementation(() => {});
    const valid = materialStub();
    const replacement = materialStub();
    replacement.normalMap = {};
    replacement.normalMapType = ObjectSpaceNormalMap;
    const mesh = {
      children: [{ material: valid, geometry: geometryStub() }],
    };
    let renderer: ReactTestRenderer | undefined;
    act(() => {
      renderer = create(
        createElement(
          FeelableSurface,
          { material: "cloth" },
          createElement("meshStandardMaterial"),
        ),
        { createNodeMock: () => mesh },
      );
    });
    act(() => frameCallbacks.at(-1)?.({}, 0.01667));
    expect(valid.onBeforeCompile).not.toBe(valid.original);
    report.mockClear();

    mesh.children = [{ material: replacement, geometry: geometryStub() }];
    expect(() => act(() => frameCallbacks.at(-1)?.({}, 0.01667))).not.toThrow();
    expect(valid.onBeforeCompile).toBe(valid.original);
    expect(replacement.onBeforeCompile).toBe(replacement.original);
    expect(report).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledWith(expect.stringMatching(/object-space/));
    act(() => frameCallbacks.at(-1)?.({}, 0.01667));
    expect(report).toHaveBeenCalledOnce();

    delete replacement.normalMap;
    act(() => frameCallbacks.at(-1)?.({}, 0.01667));
    expect(replacement.onBeforeCompile).not.toBe(replacement.original);
    act(() => renderer?.unmount());
    expect(replacement.onBeforeCompile).toBe(replacement.original);
    report.mockRestore();
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
    uFeelableBladeField: { value: config.kind === "grass" ? 1 : 0 },
    uFeelableSmudge: poke.uSmudge,
    uFeelableSmudgePosition: poke.uSmudgePosition,
    uFeelableWeave: { value: config.kind === "cloth" ? 1 : 0 },
    uFeelableContactRoughness: {
      value: config.kind === "enamel" ? 1 : 0,
    },
  };
}

function shaderFor(kind: (typeof shaderCases)[number][0]) {
  return {
    uniforms: {} as Record<string, unknown>,
    vertexShader: ShaderLib[kind].vertexShader,
    fragmentShader: ShaderLib[kind].fragmentShader,
  };
}

type MaterialStub = {
  isMaterial: true;
  needsUpdate: boolean;
  normalMap?: unknown;
  normalMapType?: number;
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
