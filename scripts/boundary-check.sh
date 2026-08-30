#!/usr/bin/env bash
#
# Proves the domain purity gate actually fires.
#
# A lint rule that silently stops matching is worse than no rule: the build
# stays green and the guarantee is gone. This injects the two violations the
# rule exists to catch and fails if eslint does not object to both, then puts
# the file back.
#
# Grid's equivalent gate went in after a document sat untracked for a day.
# This one went in before, on the strength of that.

set -uo pipefail
cd "$(dirname "$0")/.."

# Whichever domain file comes first, rather than one named here.
#
# Naming `trip.ts` meant this gate would go quietly green the day somebody
# renamed it — `cp` would fail, `set -uo pipefail` has no `-e`, and the eslint
# run below would find no violation in a file that does not exist. The same
# defect was found in the sibling project's copy of this script and fixed there
# first.
TARGET=$(find packages/domain/src -name '*.ts' -not -name 'index.ts' | sort | head -1)
if [ -z "$TARGET" ] || [ ! -f "$TARGET" ]; then
  echo "boundary gate found no domain source to test against — the path is wrong or the code moved" >&2
  exit 1
fi

BACKUP=$(mktemp)
cp "$TARGET" "$BACKUP"
restore() { cp "$BACKUP" "$TARGET"; rm -f "$BACKUP"; }
trap restore EXIT

{
  echo ""
  echo "import { Platform } from 'react-native';"
  echo "export const _platform = Platform;"
  echo "export const _now = Date.now();"
} >> "$TARGET"

output=$(node_modules/.bin/eslint "$TARGET" 2>&1 || true)

status=0
if ! grep -q 'no-restricted-imports' <<<"$output"; then
  printf '\033[31m%s\033[0m\n' "the domain boundary rule did not fire on a react-native import"
  status=1
fi
if ! grep -q 'no-restricted-syntax' <<<"$output"; then
  printf '\033[31m%s\033[0m\n' "the clock rule did not fire on Date.now()"
  status=1
fi

if [ "$status" -eq 0 ]; then
  printf '\033[32m%s\033[0m\n' "domain boundary gate is live"
fi
exit "$status"
