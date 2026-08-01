import {
  createElement,
  type ReactElement,
  type ReactNode,
  useCallback,
  useMemo,
} from "react";
import {
  createGrassBladeInstances,
  type GrassBladeOptions,
} from "../math/pokeModel.js";
import { resolveGrassBladeCount } from "../math/reducedMotionSurface.js";
import { FeelableSurface } from "./FeelableSurface.js";

export type GrassLogoSurfaceProps = GrassBladeOptions & {
  children?: ReactNode | undefined;
  reducedMotion?: boolean | undefined;
};

type MatrixLike = {
  set: (...values: number[]) => MatrixLike;
};

type InstancedMeshLike = {
  count: number;
  matrix: { clone: () => MatrixLike };
  instanceMatrix: { needsUpdate: boolean };
  setMatrixAt: (index: number, matrix: MatrixLike) => void;
};

const ignoreRaycast = () => undefined;

export function applyGrassBladeMatrices(
  mesh: InstancedMeshLike,
  blades: ReturnType<typeof createGrassBladeInstances>,
) {
  const matrix = mesh.matrix.clone();
  blades.forEach((blade, index) => {
    const cos = Math.cos(blade.angle);
    const sin = Math.sin(blade.angle);
    const flex = 1.2 - blade.stiffness;
    matrix.set(
      cos * blade.width,
      0,
      sin * flex,
      blade.x - 0.5,
      sin * blade.width,
      0,
      -cos * flex,
      blade.y - 0.5,
      0,
      blade.height,
      0,
      blade.height / 2,
      0,
      0,
      0,
      1,
    );
    mesh.setMatrixAt(index, matrix);
  });
  mesh.count = blades.length;
  mesh.instanceMatrix.needsUpdate = true;
}

export function GrassLogoSurface({
  children,
  reducedMotion,
  count: rawCount,
  mask,
  seed,
}: GrassLogoSurfaceProps): ReactElement {
  const count = resolveGrassBladeCount(rawCount, reducedMotion);
  const blades = useMemo(
    () => createGrassBladeInstances({ count, mask, seed }),
    [count, mask, seed],
  );
  const setMesh = useCallback(
    (mesh: InstancedMeshLike | null) => {
      if (mesh) applyGrassBladeMatrices(mesh, blades);
    },
    [blades],
  );

  return createElement(
    FeelableSurface,
    {
      material: "grass",
      reducedMotion,
      userData: { grassBlades: blades },
    },
    createElement("planeGeometry", { args: [1, 1] }),
    createElement("meshBasicMaterial", {
      visible: false,
    }),
    createElement(
      "instancedMesh",
      {
        ref: setMesh,
        args: [undefined, undefined, blades.length],
        raycast: ignoreRaycast,
        frustumCulled: false,
        userData: { grassBlades: blades },
      },
      children,
    ),
  );
}
