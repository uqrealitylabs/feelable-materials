# feelable-materials

Tactile React Three Fiber material surfaces for cloth, rubber, glass, grass, and touchable logos.

## What It Is

`@uqrealitylabs/feelable-materials` is a small interaction model and React Three Fiber component layer for pointer-local surfaces. It was extracted from the UQ Reality Labs social material cards and keeps the reusable parts: cloth creases, rubber mush, glass smudges, grass blade fields, mail/card bending, and a shared poke model.

The internal idea is "materials actually": material labels should behave differently, not just swap colours.

## When To Use It

Use it for small R3F cards, logos, or material swatches that need local pointer response.

Do not use it for full physics simulation, cloth solvers, production damage systems, or site-specific social link grids.

## Install

```sh
npm install @uqrealitylabs/feelable-materials three @react-three/fiber
```

## Basic Example

```tsx
import { FeelableMaterialCard } from "@uqrealitylabs/feelable-materials/react";

export function SocialCard() {
  return (
    <FeelableMaterialCard
      material="grass"
      ariaLabel="Community"
      logo={<mesh />}
      underline
    />
  );
}
```

> [!NOTE]
> The package provides R3F-compatible components and pure model helpers. Apps still own their canvas, camera, lighting, labels, and links.

## Materials

### Cloth

Soft local crease, surface depression, and slow return.

### Rubber

Stronger inward mush, local bulge, and elastic rebound.

### Glass

Smudge/contact accumulation with fade over time and roughness-style response metadata.

### Grass

Deterministic blade/card instances with local bend and spring-back data. Use `createGrassBladeInstances()` for logo masks or full-card fields.

### Mail

Card-like bend response for email or document surfaces.

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

## Interactive Demo

Run the demo locally with `npm run demo:dev`. A production build is written to
`demo-dist/` by `npm run demo:build`, and `npm run demo:preview` serves that
output locally.

The demo is built with `/project/feelable-materials/` as its production base
path and is intended for
`https://uqrealitylabs.com/project/feelable-materials/`. The current repository
Pages site is separately exposed at
`https://uqrealitylabs.com/feelable-materials/`; the organisation's root-site
or proxy configuration must map the requested `/project/feelable-materials/`
path to this Pages deployment. No conflicting `CNAME` is committed here.

No Chalk font asset is present in the source repositories. The demo therefore
uses the existing OFL-licensed Pixelify Sans asset in `examples/demo/src/assets`
with a Chalk/Chalkboard fallback stack. The original font notices remain beside
the asset.

## License

See `LICENSE`.
