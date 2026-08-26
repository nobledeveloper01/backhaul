#!/usr/bin/env bash
#
# Captures a screenshot from the booted iOS simulator into docs/screenshots.
#
#   ./scripts/screenshot.sh 01-trips-light
#
# Quantised on the way in. A raw simulator PNG is around 2 MB and twenty of
# them would be most of this repository; at 256 colours they are a tenth of
# that and no reviewer can tell the difference on a screenshot of flat UI.
#
# The documentation gate checks two things about what lands here: that every
# file is tracked by git, and that every file is referenced by some document.
# A screenshot nobody links to sits there going stale with nothing pointing at
# it, which happened on a sibling project.

set -euo pipefail
cd "$(dirname "$0")/.."

name="${1:-}"
if [ -z "$name" ]; then
  echo "usage: $0 <name>   e.g. $0 01-trips-light" >&2
  exit 1
fi

mkdir -p docs/screenshots
out="docs/screenshots/${name}.png"

xcrun simctl io booted screenshot --type=png "$out" >/dev/null

if command -v pngquant >/dev/null 2>&1; then
  pngquant --force --quality 60-85 --output "$out" -- "$out"
elif command -v sips >/dev/null 2>&1; then
  # sips cannot quantise, but it can halve the pixel dimensions, which is the
  # next best thing and is on every Mac.
  width=$(sips -g pixelWidth "$out" | awk '/pixelWidth/ {print $2}')
  sips --resampleWidth $((width / 2)) "$out" >/dev/null
fi

printf '%s  %s\n' "$out" "$(du -h "$out" | cut -f1)"
