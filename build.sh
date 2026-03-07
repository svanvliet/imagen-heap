#!/usr/bin/env bash
# Build Imagen Heap for distribution (and optionally publish a GitHub release)
#
# Usage:
#   ./build.sh                                  # Build only
#   ./build.sh --release v0.1.1                 # Build + tag + GitHub release
#   ./build.sh --release v0.1.1 --notes "..."   # Build + tag + release with custom notes
set -euo pipefail
cd "$(dirname "$0")"

RELEASE_TAG=""
RELEASE_NOTES=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --release)
      RELEASE_TAG="$2"
      shift 2
      ;;
    --notes)
      RELEASE_NOTES="$2"
      shift 2
      ;;
    *)
      echo "❌ Unknown option: $1"
      echo "Usage: ./build.sh [--release <tag>] [--notes \"Release notes\"]"
      exit 1
      ;;
  esac
done

# --- Build ---
echo "📦 Building Imagen Heap for distribution..."
echo ""

npx tauri build

echo ""
echo "✅ Build complete!"
ls -lh src-tauri/target/release/bundle/macos/*.app 2>/dev/null || true
ls -lh src-tauri/target/release/bundle/dmg/*.dmg 2>/dev/null || true

# --- Release (optional) ---
if [[ -z "$RELEASE_TAG" ]]; then
  exit 0
fi

echo ""
echo "🚀 Publishing release ${RELEASE_TAG}..."

# Validate tag format (vX.Y.Z)
if [[ ! "$RELEASE_TAG" =~ ^v[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "❌ Tag must follow semver format: vX.Y.Z (e.g. v0.1.0)"
  exit 1
fi

# Extract version without 'v' prefix
VERSION="${RELEASE_TAG#v}"

# Update version in tauri.conf.json and package.json
echo "  → Updating version to ${VERSION}..."
python3 -c "
import json, sys
for f in ['src-tauri/tauri.conf.json', 'package.json']:
    with open(f) as fh: data = json.load(fh)
    data['version'] = '${VERSION}'
    with open(f, 'w') as fh: json.dump(data, fh, indent=2)
    fh.write('\n')
    print(f'    Updated {f}')
"

# Rebuild if version changed (DMG filename includes version)
if [[ "$VERSION" != "$(python3 -c "import json; print(json.load(open('src-tauri/tauri.conf.json'))['version'])" 2>/dev/null)" ]]; then
  echo "  → Rebuilding with updated version..."
  npx tauri build
fi

# Find the DMG
DMG=$(find src-tauri/target/release/bundle/dmg -name "*.dmg" -type f | head -1)
if [[ -z "$DMG" ]]; then
  echo "❌ No DMG found in src-tauri/target/release/bundle/dmg/"
  exit 1
fi
echo "  → Found artifact: $(basename "$DMG") ($(du -h "$DMG" | cut -f1 | xargs))"

# Check for uncommitted changes and commit version bump if needed
if ! git diff --quiet src-tauri/tauri.conf.json package.json 2>/dev/null; then
  echo "  → Committing version bump..."
  git add src-tauri/tauri.conf.json package.json
  git commit -m "chore: bump version to ${VERSION}"
fi

# Create annotated tag
if git rev-parse "$RELEASE_TAG" >/dev/null 2>&1; then
  echo "  ⚠️  Tag ${RELEASE_TAG} already exists — using existing tag"
else
  echo "  → Creating tag ${RELEASE_TAG}..."
  git tag -a "$RELEASE_TAG" -m "${RELEASE_TAG} release"
fi

# Push commit + tag
echo "  → Pushing to origin..."
git push origin main --quiet 2>&1
git push origin "$RELEASE_TAG" --quiet 2>&1

# Build default release notes if none provided
if [[ -z "$RELEASE_NOTES" ]]; then
  PREV_TAG=$(git tag --sort=-creatordate | grep -v "^${RELEASE_TAG}$" | head -1 || true)
  RELEASE_NOTES="## Imagen Heap ${RELEASE_TAG}"$'\n\n'
  if [[ -n "$PREV_TAG" ]]; then
    CHANGELOG=$(git --no-pager log --oneline "${PREV_TAG}..${RELEASE_TAG}" -- | head -20)
    if [[ -n "$CHANGELOG" ]]; then
      RELEASE_NOTES+="### Changes since ${PREV_TAG}"$'\n\n'
      while IFS= read -r line; do
        RELEASE_NOTES+="- ${line}"$'\n'
      done <<< "$CHANGELOG"
      RELEASE_NOTES+=$'\n'
    fi
  fi
  RELEASE_NOTES+="### Install"$'\n'
  RELEASE_NOTES+="1. Download the \`.dmg\` below"$'\n'
  RELEASE_NOTES+="2. Open and drag **Imagen Heap** to Applications"$'\n'
  RELEASE_NOTES+="3. Right-click → Open to bypass Gatekeeper (app is unsigned)"$'\n\n'
  RELEASE_NOTES+="**Requires:** macOS with Apple Silicon (M1/M2/M3/M4) and Python 3.10+"
fi

# Create GitHub release
echo "  → Creating GitHub release..."
gh release create "$RELEASE_TAG" "$DMG" \
  --title "Imagen Heap ${RELEASE_TAG}" \
  --notes "$RELEASE_NOTES"

RELEASE_URL=$(gh release view "$RELEASE_TAG" --json url -q .url)
echo ""
echo "🎉 Release published: ${RELEASE_URL}"
