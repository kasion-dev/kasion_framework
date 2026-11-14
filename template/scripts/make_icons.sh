#!/bin/sh
# Build the PNG app icons from public/icon.svg (iPhone home-screen icons cannot be SVG). macOS only (qlmanage + sips).
set -e
cd "$(dirname "$0")/../public"
out="$(mktemp -d)"
qlmanage -t -s 512 -o "$out" icon.svg >/dev/null 2>&1
sips -z 512 512 "$out/icon.svg.png" --out icon-512.png >/dev/null
sips -z 192 192 "$out/icon.svg.png" --out icon-192.png >/dev/null
sips -z 180 180 "$out/icon.svg.png" --out apple-touch-icon.png >/dev/null
echo "icons written: icon-512.png icon-192.png apple-touch-icon.png"
