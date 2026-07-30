#!/usr/bin/env bash
# Builds both game modes into _site/ for static hosting.
#
#   scripts/build-pages.sh [base-path]
#
# base-path is the URL prefix the site is served from, with leading and
# trailing slashes — "/madring_machines/" on GitHub Pages, "/" locally.
set -euo pipefail

BASE="${1:-/}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$ROOT/_site"

echo "==> building into $OUT (base $BASE)"
rm -rf "$OUT"
mkdir -p "$OUT/2d" "$OUT/3d"

# ── 2D: Phaser, plain static files ──
echo "==> 2D bundle"
cd "$ROOT"
node esbuild.js
cp index.html "$OUT/2d/"
cp -r dist music images "$OUT/2d/"

# ── 3D: Vite build ──
echo "==> 3D bundle"
cd "$ROOT/madring-3d"
VITE_BASE="${BASE}3d/" npm run build
cp -r dist/. "$OUT/3d/"

# ── landing page ──
cd "$ROOT"
sed "s#{{BASE}}#${BASE}#g" scripts/pages-index.html > "$OUT/index.html"

# Pages runs Jekyll otherwise, which drops files and folders beginning with _
touch "$OUT/.nojekyll"

echo "==> done"
du -sh "$OUT" "$OUT"/*
