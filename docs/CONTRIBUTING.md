# Contributing

Keep changes small and runnable.

## Workflow

1. Open or link an issue for non-trivial work.
2. Keep pull requests focused on one material, model helper, or package maintenance task.
3. Update tests when poke math, material presets, reduced-motion behaviour, or exported API changes.
4. Do not commit generated output, local env files, screenshots, videos, or private assets.

## Before Opening A Pull Request

Run:

```sh
npm run typecheck
npm run lint
npm run format:check
npm run test
npm run build
```

## API Changes

Keep route, content, brand, and social-link mapping in consuming apps. This package should stay reusable outside one website.
