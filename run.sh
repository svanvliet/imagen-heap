#!/usr/bin/env bash
# Run Imagen Heap in development mode
set -euo pipefail
cd "$(dirname "$0")"

echo "🚀 Starting Imagen Heap (dev mode)..."
npx tauri dev
