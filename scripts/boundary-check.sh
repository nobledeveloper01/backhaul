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

TARGET=packages/domain/src/trip.ts
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
