# feelable-materials

Tactile React Three Fiber surfaces for cloth, rubber, glass, grass, thin sheets, enamel, and touchable logos.

## What It Is

`@uqrealitylabs/feelable-materials` is a small interaction model and React Three Fiber component layer for pointer-local deformation, glass smudges, and grass blade fields.

## When To Use It

Use it for small R3F cards, logos, or material swatches that need local pointer response.

Do not use it for full physics simulation, cloth solvers, production damage systems, or site-specific social link grids.

## Install

```sh
npm install @uqrealitylabs/feelable-materials three @react-three/fiber
```

## Basic Example

```tsx
import { FeelableSurface } from "@uqrealitylabs/feelable-materials/react";

export function SocialCard() {
  return (
    <FeelableSurface material="grass">
      <planeGeometry args={[2.55, 1.5, 24, 14]} />
      <meshStandardMaterial color="#a7d88b" />
    </FeelableSurface>
  );
}
```

> [!NOTE]
> Render React components inside an R3F `Canvas`. Apps still own their canvas,
> camera, lighting, accessible HTML controls, labels, and links. Geometry needs
> enough vertices and usable, non-overlapping UVs for local deformation.

Use a dedicated Three material instance for a `FeelableSurface`. Sharing between
two feelable surfaces is rejected; sharing with an ordinary mesh is forbidden
but cannot be detected by Three. Use `meshProps` for mesh transforms, shadow
flags, names, and other R3F mesh settings.

## Materials

### Cloth

Broad local depression and slow return.

### Rubber

Deeper local depression and quicker return.

### Glass

Smudge/contact accumulation with fade over time and roughness-style response metadata.

### Grass

Deterministic blade instances with pointer-local tip displacement. Use `createGrassBladeInstances()` for logo masks or full-card fields.

### Mail

Legacy preset name for shallow-flexing cards, foil, or other thin sheets.

### Enamel

Small hard-surface response for coated ceramic or metal.

The demo catalogue maps several appearances onto these interaction archetypes:
orange velvet and satin use `cloth`; silicone uses `rubber`; frosted glass uses
`glass`; turf uses `grass`; brushed and holographic foil use `mail`; glazed
ceramic uses `enamel`. This keeps appearance choices out of the physics API.

`FeelableSurface` renders preset radius, depth, return, corrected lighting
normals, and press-only glass roughness marks. `GrassLogoSurface` adds instanced blades. The extra values returned
by `getMaterialResponse()` are model data for consumer-owned effects; the
built-in shader does not claim to be a cloth, rubber, or card physics solver.

The component supports `Three.WebGLRenderer` only; `WebGPURenderer` does not run
`onBeforeCompile`. GPU displacement does not change CPU raycasts or Three's
separate shadow-material passes. Overlapping UV islands receive the same local
response. Tangent-space normal and bump maps are supported; object-space normal
maps are rejected because they overwrite the corrected contact normal.
Generic instances share one UV response; `GrassLogoSurface` alone maps instance
positions into its blade field.

## Multiple Materials On One Object

Use Three's native geometry groups and material array. `FeelableSurface`
already patches each attached material; no wrapper API is needed.

```tsx
geometry.clearGroups();
geometry.addGroup(0, firstRegionIndexCount, 0);
geometry.addGroup(firstRegionIndexCount, secondRegionIndexCount, 1);

<FeelableSurface material="mail">
  <primitive object={geometry} attach="geometry" />
  <primitive object={metal} attach="material-0" />
  <primitive object={coating} attach="material-1" />
</FeelableSurface>;
```

Every group is a draw call, and indexed groups must cover each index exactly
once without overlaps or gaps. Prefer vertex colours or a texture atlas when
regions share one BRDF; reserve groups for genuinely different materials.

## How Pointer-Local Poking Works

The poke model stores UV/local pointer position, pressure, previous position, target pressure, and material-specific decay. Hover can apply light pressure. Press/touch applies stronger pressure. Each frame calls `stepPoke(state, material)` to move toward the target and decay back to rest.

## Performance Rules

- Store fast-changing poke state in refs, uniforms, or buffers.
- Do not call React `setState` in `useFrame`.
- Do not call React `setState` on every pointer move.
- Use deterministic grass instance data and update only the affected uniforms or instance attributes.

> [!WARNING]
> This is an interaction package, not a physics engine. Keep expensive simulation in the app if a project proves it needs one.

## Accessibility And Reduced Motion

R3F meshes are not accessible by themselves. Put accessible labels and keyboard activation on the surrounding HTML control. Use `reducedMotion` for static or lower-power surfaces.

## Testing Notes

The testable core is pure TypeScript:

- `createPokeState()`
- `applyPoke()`
- `stepPoke()`
- `getPokeInfluence()`
- `createGrassBladeInstances()`
- `createPokeUniforms()`

> [!TIP]
> Test material behaviour with the pure model first. Add browser or visual tests only when a real canvas regression requires them.

## What This Package Does Not Do

- It does not include UQ social links or content.
- It does not ship brand or paid logo assets.
- It does not create a Canvas for you.
- It does not use Playwright or Cypress.
- It does not bundle Three.js or React.

## Development Commands

Development requires Node.js 22.18 or newer.

```sh
npm install
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
npm run demo:build
```

## Interactive Demo

Run the demo locally with `npm run demo:dev`. A production build is written to
`demo-dist/` by `npm run demo:build`, and `npm run demo:preview` serves that
output locally. Velvet and satin add a demo-only, fixed-step PBD cloth grid;
the solver is intentionally not part of the package API.

The GitHub Pages demo is deployed at
`https://uqrealitylabs.com/feelable-materials/` with
`/feelable-materials/` as its production asset base. No proxy mapping is
required.

The first npm release requires one manual `npm publish` with npm's two-factor
browser authentication. Then configure npm trusted publishing for this
repository, `checks.yml`, and the `npm` environment. Later releases use GitHub
OIDC and provenance without a stored npm token.

No Chalk font asset is present in the source repositories. The demo therefore
uses the existing OFL-licensed Pixelify Sans asset in `examples/demo/src/assets`
with a Chalk/Chalkboard fallback stack. The original font notices remain beside
the asset.

## License

See `LICENSE`.
