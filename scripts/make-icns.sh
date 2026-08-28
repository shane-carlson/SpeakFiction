#!/usr/bin/env bash
# Build build/icon.icns from public/speakfiction-logo.png (macOS sips + iconutil).
exec node "$(cd "$(dirname "$0")" && pwd)/make-icns.cjs" "$@"
