#!/usr/bin/env bash
# Build whisper.cpp into models/bin/ (arm64) or models/bin-x64/ (Intel).
# Usage:
#   bash scripts/build-whisper-cli.sh
#   ARCH=x86_64 bash scripts/build-whisper-cli.sh
#   FORCE=1 ARCH=x86_64 bash scripts/build-whisper-cli.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ARCH="${ARCH:-$(uname -m)}"
case "$ARCH" in
  x64|intel|x86_64) ARCH=x86_64 ;;
  aarch64|arm64) ARCH=arm64 ;;
esac

if [[ "$ARCH" == "x86_64" ]]; then
  BIN="$ROOT/models/bin-x64"
  BUILD_DIR=build-x64
else
  BIN="$ROOT/models/bin"
  BUILD_DIR=build
fi
CLI="$BIN/whisper-cli"
FORCE="${FORCE:-0}"
if [[ -x "$CLI" && "$FORCE" != "1" ]]; then
  echo "whisper-cli already at $CLI"
  file "$CLI" || true
  exit 0
fi
mkdir -p "$BIN" "$ROOT/vendor"
export PATH="$HOME/.local/bin:$HOME/Library/Python/3.11/bin:$HOME/Library/Python/3.9/bin:$PATH"
if ! command -v cmake >/dev/null 2>&1; then
  python3 -m pip install --user cmake
fi
if [[ ! -d "$ROOT/vendor/whisper.cpp/.git" ]]; then
  git clone --depth 1 --branch v1.9.2 https://github.com/ggml-org/whisper.cpp.git "$ROOT/vendor/whisper.cpp"
fi
cd "$ROOT/vendor/whisper.cpp"

cmake_common=(
  -DCMAKE_BUILD_TYPE=Release
  -DCMAKE_OSX_ARCHITECTURES="$ARCH"
  -DCMAKE_OSX_DEPLOYMENT_TARGET=12.0
  -DGGML_NATIVE=OFF
  -DGGML_CCACHE=OFF
)
if [[ "$ARCH" == "x86_64" ]]; then
  cmake_common+=(
    -DCMAKE_SYSTEM_PROCESSOR=x86_64
    -DCMAKE_C_FLAGS="-arch x86_64 -march=x86-64-v2"
    -DCMAKE_CXX_FLAGS="-arch x86_64 -march=x86-64-v2"
  )
fi

build_whisper() {
  local metal="$1"
  cmake -B "$BUILD_DIR" "${cmake_common[@]}" -DGGML_METAL="$metal"
  cmake --build "$BUILD_DIR" -j "$(sysctl -n hw.ncpu 2>/dev/null || echo 4)" --config Release --target whisper-cli whisper-server
}

if [[ "$ARCH" == "x86_64" ]]; then
  echo "Building CPU whisper.cpp for Intel ($ARCH) — Metal is Apple Silicon only."
  build_whisper OFF
else
  if ! build_whisper ON; then
    echo "Metal build failed for $ARCH; retrying CPU-only." >&2
    rm -rf "$BUILD_DIR"
    build_whisper OFF
  fi
fi

cp -f "$BUILD_DIR/bin/whisper-cli" "$CLI"
if [[ -f "$BUILD_DIR/bin/whisper-server" ]]; then
  cp -f "$BUILD_DIR/bin/whisper-server" "$BIN/whisper-server"
fi
cp -f "$BUILD_DIR/bin/"*.dylib "$BIN/" 2>/dev/null || true
chmod +x "$CLI" "$BIN/whisper-server" 2>/dev/null || true
install_name_tool -add_rpath @executable_path "$CLI" 2>/dev/null || true
install_name_tool -add_rpath @executable_path "$BIN/whisper-server" 2>/dev/null || true
echo "Installed $CLI ($ARCH)"
file "$CLI" || true
