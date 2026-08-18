#!/usr/bin/env bash
# Build build/icon.icns from public/speakfiction-logo.png (macOS sips + iconutil).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="$ROOT/public/speakfiction-logo.png"
ICONSET="$ROOT/build/icon.iconset"
ICNS="$ROOT/build/icon.icns"

if [[ ! -f "$SRC" ]]; then
  echo "Missing logo: $SRC" >&2
  exit 1
fi

rm -rf "$ICONSET"
mkdir -p "$ICONSET"

render() {
  local px="$1" name="$2"
  sips -z "$px" "$px" "$SRC" --out "$ICONSET/$name" >/dev/null
}

render 16 icon_16x16.png
render 32 icon_16x16@2x.png
render 32 icon_32x32.png
render 64 icon_32x32@2x.png
render 128 icon_128x128.png
render 256 icon_128x128@2x.png
render 256 icon_256x256.png
render 512 icon_256x256@2x.png
render 512 icon_512x512.png
render 1024 icon_512x512@2x.png

iconutil -c icns "$ICONSET" -o "$ICNS"
rm -rf "$ICONSET"
echo "Wrote $ICNS"
