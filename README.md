# feelable-materials

Tactile React Three Fiber material surfaces for cloth, rubber, glass, grass, and touchable logos.

## What It Is

`@uqrealitylabs/feelable-materials` is a small interaction model and React Three Fiber component layer for pointer-local deformation, glass smudges, and grass blade fields.

## When To Use It

Use it for small R3F cards, logos, or material swatches that need local pointer response.

Do not use it for full physics simulation, cloth solvers, production damage systems, or site-specific social link grids.

## Install

```sh
npm install github:uqrealitylabs/feelable-materials three @react-three/fiber
```

The scoped package is not yet published to the npm registry. The GitHub source
installs under the same `@uqrealitylabs/feelable-materials` package name.

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

Shallow local depression and return for card-like surfaces.

`FeelableSurface` renders preset radius, depth, tint, return, and glass-smudge
differences. `GrassLogoSurface` adds instanced blades. The extra values returned
by `getMaterialResponse()` are model data for consumer-owned effects; the
built-in shader does not claim to be a cloth, rubber, or card physics solver.

The component supports `Three.WebGLRenderer` only; `WebGPURenderer` does not run
`onBeforeCompile`. GPU displacement does not change CPU raycasts or Three's
separate shadow-material passes. Overlapping UV islands receive the same local
response.

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

```sh
npm install
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
npm run demo:build
```

## Releases

`.github/workflows/release.yml` uses Release Please to create the GitHub release,
then verifies and publishes that tag to npm with provenance. Add a narrowly scoped
`RELEASE_PLEASE_TOKEN` to the main-only `release` GitHub environment so its pull
requests trigger `checks.yml`. Retry a failed publish by dispatching `release.yml`
with the existing release tag.

The first registry publication needs a short-lived granular `NPM_TOKEN` secret in
the `npm` GitHub environment. After it succeeds, configure the npm trusted
publisher for `uqrealitylabs/feelable-materials`, workflow `release.yml`,
environment `npm`, and action `npm publish`; then delete the token and require 2FA
while disallowing tokens. Trusted publishing requires npm 11.5.1 or newer.

## Interactive Demo

Run the demo locally with `npm run demo:dev`. A production build is written to
`demo-dist/` by `npm run demo:build`, and `npm run demo:preview` serves that
output locally.

The GitHub Pages demo is deployed at
`https://uqrealitylabs.com/feelable-materials/` with
`/feelable-materials/` as its production asset base. No proxy mapping is
required.

No Chalk font asset is present in the source repositories. The demo therefore
uses the existing OFL-licensed Pixelify Sans asset in `examples/demo/src/assets`
with a Chalk/Chalkboard fallback stack. The original font notices remain beside
the asset.

## License

See `LICENSE`.
