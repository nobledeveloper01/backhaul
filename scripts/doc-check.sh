#!/usr/bin/env bash
#
# The documentation gate.
#
# Runs in pre-commit and in CI. It blocks on a document that is missing,
# malformed, or — the one that has actually bitten — present on disk and not in
# git. It warns when code has moved and the journal has not.
#
# The warning is the one that matters. It is the difference between a project
# that is documented and a project that has documentation.

set -uo pipefail
cd "$(dirname "$0")/.."

fail=0
warn=0

red()   { printf '\033[31m%s\033[0m\n' "$1"; }
amber() { printf '\033[33m%s\033[0m\n' "$1"; }
green() { printf '\033[32m%s\033[0m\n' "$1"; }

REQUIRED=(
  README.md
  DESIGN.md
  CHANGELOG.md
  PHASE
  docs/00-PRODUCT-STATEMENT.md
  docs/ROADMAP.md
  docs/JOURNAL.md
  server/README.md
  docs/TOOLCHAIN.md
  fixtures/parity.json
)

for doc in "${REQUIRED[@]}"; do
  if [ ! -f "$doc" ]; then
    red "missing: $doc"
    fail=1
    continue
  fi
  # Present on disk is not the same as shipped. A .gitignore allow-list that
  # forgets a file makes `git add` a silent no-op and the commit message a lie.
  if ! git ls-files --error-unmatch "$doc" >/dev/null 2>&1; then
    red "not tracked by git: $doc — check the allow-list in .gitignore"
    fail=1
  fi
done

# The fixed list above cannot cover `docs/adr/`, which grows. An ADR is the
# document this project leans on hardest — CLAUDE.md says write one *before*
# the code that depends on it, and CHANGELOG entries link to them by path — so
# an untracked ADR is a 404 on GitHub under a commit that reported success.
# That is the Grid failure exactly, and the fixed list had a hole shaped like
# it: two ADRs sat on disk, unignored and un-added, while this gate passed.
for adr in docs/adr/*.md; do
  [ -e "$adr" ] || continue
  if ! git ls-files --error-unmatch "$adr" >/dev/null 2>&1; then
    red "not tracked by git: $adr — an ADR on disk is not an ADR anybody can read"
    fail=1
  fi
done

# --- shape -----------------------------------------------------------------

if [ -f CHANGELOG.md ] && ! grep -q '^## \[Unreleased\]' CHANGELOG.md; then
  red "CHANGELOG.md has no [Unreleased] section"
  fail=1
fi

if [ -f PHASE ]; then
  phase=$(tr -d '[:space:]' < PHASE)
  if ! [[ "$phase" =~ ^[0-9]+$ ]]; then
    red "PHASE should hold a bare phase number, found '$phase'"
    fail=1
  elif [ -f docs/ROADMAP.md ] && ! grep -q "Phase $phase" docs/ROADMAP.md; then
    red "PHASE says $phase and docs/ROADMAP.md does not mention Phase $phase"
    fail=1
  fi
fi

for adr in docs/adr/[0-9]*.md; do
  [ -e "$adr" ] || continue
  for heading in '## Status' '## Context' '## Decision' '## Consequences'; do
    if ! grep -qF "$heading" "$adr"; then
      red "$adr is missing '$heading'"
      fail=1
    fi
  done
done

# --- screenshots -----------------------------------------------------------
#
# Two failures, both seen before. Screenshots on disk and not in git render as
# broken images for everyone but their author; screenshots in git and in no
# document sit there for weeks getting stale with nothing pointing at them.

if [ -d docs/screenshots ]; then
  on_disk=$(find docs/screenshots -name '*.png' | wc -l | tr -d ' ')
  tracked=$(git ls-files docs/screenshots | grep -c '\.png$' || true)
  if [ "$on_disk" != "$tracked" ]; then
    red "docs/screenshots: $on_disk on disk, $tracked tracked by git"
    fail=1
  fi

  # Searched over git's own file list rather than the working tree. The
  # recursive grep was fine when this repository was a domain package and a
  # few documents; with node_modules, Pods and two build trees in it, the same
  # check took minutes and then timed out. `git ls-files` is both faster and
  # more correct — an untracked copy of a document is not documentation.
  tracked_md=$(git ls-files '*.md' 2>/dev/null)
  orphans=""
  for shot in docs/screenshots/*.png; do
    [ -e "$shot" ] || continue
    base=$(basename "$shot")
    if [ -z "$tracked_md" ] || ! grep -ql "$base" $tracked_md 2>/dev/null; then
      orphans="$orphans $base"
    fi
  done
  if [ -n "$orphans" ]; then
    red "screenshots referenced by no document:$orphans"
    fail=1
  fi
fi

# --- freshness -------------------------------------------------------------

if [ -f docs/JOURNAL.md ] && git rev-parse --git-dir >/dev/null 2>&1; then
  last_journal=$(git log -1 --format=%ct -- docs/JOURNAL.md 2>/dev/null || echo 0)
  last_code=$(git log -1 --format=%ct -- 'packages' 'apps' 2>/dev/null || echo 0)
  if [ "$last_code" -gt "$last_journal" ] 2>/dev/null; then
    amber "code has moved since the last journal entry — make journal T=\"...\""
    warn=1
  fi
fi

if [ "$fail" -ne 0 ]; then
  red "documentation gate failed"
  exit 1
fi
if [ "$warn" -ne 0 ]; then
  amber "documentation gate passed with warnings"
  exit 0
fi
green "documentation gate passed"
