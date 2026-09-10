#!/usr/bin/env bash
# Adopts data from a branch pushed by the app's "Publish to GitHub" button
# into the current branch (normally run from main after checking out a fresh
# copy of the repo). Data lives under Particles/, Words/, and Phrases/, one
# JSON file per group (e.g. particles_pronoun.json / particles_other.json).
#
# Usage: ./adopt-branch.sh <branch-name> [path|all]
#   ./adopt-branch.sh kelly-edits                              # everything (default)
#   ./adopt-branch.sh kelly-edits all                           # everything, explicit
#   ./adopt-branch.sh kelly-edits Particles                     # just the Particles folder
#   ./adopt-branch.sh kelly-edits Particles/particles_pronoun.json  # just one file

set -euo pipefail

ALL_PATHS=(Particles Words Phrases)

if [[ $# -lt 1 || $# -gt 2 ]]; then
  echo "Usage: $0 <branch-name> [path|all]" >&2
  exit 1
fi

BRANCH="$1"
TARGET="${2:-all}"

if [[ "$TARGET" == "all" ]]; then
  PATHS=("${ALL_PATHS[@]}")
else
  PATHS=("$TARGET")
fi

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree isn't clean — commit or stash your changes first." >&2
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "Fetching '${BRANCH}' from origin..."
git fetch origin "$BRANCH"

for path in "${PATHS[@]}"; do
  if ! git cat-file -e "origin/${BRANCH}:${path}" 2>/dev/null; then
    echo "'${path}' doesn't exist on 'origin/${BRANCH}' — check the name and try again." >&2
    exit 1
  fi
done

echo "Adopting ${PATHS[*]} from 'origin/${BRANCH}' into '${CURRENT_BRANCH}'..."
git checkout "origin/${BRANCH}" -- "${PATHS[@]}"

# A group can be renamed or removed on the source branch, which leaves its
# old shard file (e.g. Particles/particles_old_group.json) behind locally
# since `git checkout -- <paths>` only adds/updates, never deletes. Remove
# any local file under the adopted paths that no longer exists on that branch.
branch_files="$(git ls-tree -r --name-only "origin/${BRANCH}" -- "${PATHS[@]}")"
while IFS= read -r f; do
  [[ -z "$f" ]] && continue
  if ! grep -qxF "$f" <<<"$branch_files"; then
    echo "Removing stale $f (no longer on ${BRANCH})..."
    git rm -q "$f"
  fi
done < <(git ls-files -- "${PATHS[@]}")

if git diff --cached --quiet -- "${PATHS[@]}"; then
  echo "No changes — '${CURRENT_BRANCH}' already matches 'origin/${BRANCH}' for ${PATHS[*]}."
  exit 0
fi

echo
git --no-pager diff --cached --stat -- "${PATHS[@]}"
echo

git commit -m "Adopt ${PATHS[*]} from ${BRANCH}"

echo
echo "Committed on '${CURRENT_BRANCH}'. Push when you're ready:"
echo "  git push origin ${CURRENT_BRANCH}"
