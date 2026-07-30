#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

die() {
  echo "$1" >&2
  exit 1
}

[[ $(git branch --show-current) == publishing ]] ||
  die "Run this from the one-word publishing branch."
git diff --cached --quiet || die "Commit or unstage the current index first."
git config --get alias.bkcommit >/dev/null || die "git bkcommit is not configured."
[[ $(git config --get gpg.format) == ssh ]] || die "SSH commit signing is required."

public_key=$(git config --get user.signingkey)
private_key=${public_key%.pub}
[[ -f $public_key && -f $private_key ]] || die "The configured signing key is unavailable."

if [[ -z ${SSH_AUTH_SOCK:-} ]]; then
  eval "$(ssh-agent -s)" >/dev/null
  trap 'ssh-agent -k >/dev/null' EXIT
fi

fingerprint=$(ssh-keygen -lf "$public_key" | awk '{print $2}')
ssh-add -l 2>/dev/null | grep -Fq "$fingerprint" || ssh-add "$private_key"

commit_changes() {
  local date=$1 message=$2
  shift 2
  git add -A -- "$@"
  git diff --cached --quiet || git bkcommit "$date" -S -m "$message"
}

commit_changes "2026-07-31T05:00:00+10:00" "ci: consolidate automation" \
  .github/workflows/ci.yml \
  .github/workflows/demo-pages.yml \
  .github/workflows/nightly.yml \
  .github/workflows/checks.yml \
  .github/workflows/publish.yml \
  .github/workflows/security.yml \
  .github/dependabot.yml \
  package.json \
  package-lock.json \
  tests/unit/workflow-security.test.ts \
  tools/scripts/assert-actions-pinned.ts

commit_changes "2026-07-31T05:10:00+10:00" "ci: publish releases to npm" \
  .github/workflows/release.yml \
  tools/scripts/release/update-github-release.ts \
  README.md

commit_changes "2026-07-31T05:20:00+10:00" "chore: add progressive commit helper" \
  commit.sh
