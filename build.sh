#!/usr/bin/env bash
# Build Imagen Heap for distribution
set -euo pipefail
cd "$(dirname "$0")"

echo "📦 Building Imagen Heap for distribution..."
echo ""

# Build the Tauri app (produces .app + .dmg on macOS)
npx tauri build

echo ""
echo "✅ Build complete! Output:"
ls -lh src-tauri/target/release/bundle/macos/*.app 2>/dev/null || true
ls -lh src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null || true
