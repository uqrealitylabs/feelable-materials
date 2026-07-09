# Unity / XR / Game Project Template

A starter repo for Unity, Unreal, Godot, XR builds, games, prototypes, and interactive demos.

> [!NOTE]
> This repo is a template. Delete anything that does not fit your project.

## What this is

Use this as a clean starting point for interactive projects. It gives you practical issue templates, a pull request template, and reusable `.gitignore` snippets without adding engine project files.

## When to use it

Use it for class projects, club builds, research prototypes, game jams, XR demos, and small team projects that need a tidy repo from day one.

## Pick your engine

| Engine | Start with | Notes |
| --- | --- | --- |
| Unity | `ignores/unity.gignore` | Track `Assets`, `Packages`, `ProjectSettings`, and `.meta` files. |
| Unreal | `ignores/unreal.gignore` | Track `Config`, `Content`, `Source`, and `.uproject`. |
| Godot | `ignores/godot.gignore` | Do not commit export credentials. |
| Other | `ignores/common.gignore` | Add only the snippets that match your tools. |

## Quick start

```sh
git clone <repo-url>
cd <repo>
cat ignores/common.gignore ignores/<engine>.gignore >> .gitignore
```

Use the engine file you picked above, for example `ignores/unity.gignore`. Do not overwrite an existing project `.gitignore` blindly. Merge snippets intentionally.

> [!TIP]
> Start with the engine-specific ignore file, then add only the extras you actually need.

## Ignore files

The root `.gitignore` is conservative so the template repo stays clean. Reusable snippets live in [`ignores/`](ignores/README.md). Copy or merge the snippets that match your project, engine, platform, and editor.

> [!IMPORTANT]
> Unity `.meta` files are usually part of the project and should normally be committed.

## Repo layout

```text
.github/ISSUE_TEMPLATE/  GitHub issue forms
.github/PULL_REQUEST_TEMPLATE.md
ignores/                 Reusable .gitignore snippets
README.md
CONTRIBUTING.md
CODE_OF_CONDUCT.md
SECURITY.md
```

## Asset rules

Commit source assets that the team is allowed to share and needs to build the project. Keep generated builds, caches, recordings, private packages, and large exports out of Git unless the project has a clear storage plan.

> [!WARNING]
> Do not commit paid assets, licence keys, private packages, generated builds, or giant cache folders.

## Branch and commit habits

Use short branches for focused work. Commit related changes together, and keep generated files out of the diff. Write commit messages that say what changed, not what tool made the change.

## Issues and pull requests

Use the issue forms for tasks, bugs, setup problems, and asset import problems. Pull requests should list the engine/tool version, what was tested, and any files reviewers should inspect closely.

## Security notes

Report secrets, credential leaks, signing keys, paid packages, or exploit details privately where possible. See [`SECURITY.md`](SECURITY.md).

## Maintainer checklist

- Keep this template engine-neutral.
- Remove project-specific files before sharing.
- Update ignore snippets when project tooling changes.
- Keep issue and PR templates short enough that people use them.

## Licence

This template is licensed under the terms in [`LICENSE`](LICENSE).
