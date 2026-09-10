#!/usr/bin/env bash
# Adopts particles.json, words.json, and phrases.json from a branch pushed by
# the app's "Publish to GitHub" button into the current branch (normally run
# from main after checking out a fresh copy of the repo).
#
# Usage: ./adopt-branch.sh <branch-name>

set -euo pipefail

FILES=(particles.json words.json phrases.json)

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 0908_edits" >&2
  exit 1
fi

BRANCH="$1"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree isn't clean — commit or stash your changes first." >&2
  exit 1
fi

CURRENT_BRANCH="$(git rev-parse --abbrev-ref HEAD)"

echo "Fetching '${BRANCH}' from origin..."
git fetch origin "$BRANCH"

echo "Adopting ${FILES[*]} from 'origin/${BRANCH}' into '${CURRENT_BRANCH}'..."
git checkout "origin/${BRANCH}" -- "${FILES[@]}"

if git diff --cached --quiet -- "${FILES[@]}"; then
  echo "No changes — '${CURRENT_BRANCH}' already matches 'origin/${BRANCH}' for these files."
  exit 0
fi

echo
git --no-pager diff --cached --stat -- "${FILES[@]}"
echo

git commit -m "Adopt particles/words/phrases.json from ${BRANCH}"

echo
echo "Committed on '${CURRENT_BRANCH}'. Push when you're ready:"
echo "  git push origin ${CURRENT_BRANCH}"
