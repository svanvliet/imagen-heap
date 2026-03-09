#!/usr/bin/env bash
# prepare-dataset.sh — Prepare reference photos for LoRA training
# Usage: ./scripts/prepare-dataset.sh <source_photos_dir> <character_name> <description>
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

SOURCE_DIR="${1:-}"
CHARACTER_NAME="${2:-}"
DESCRIPTION="${3:-a person}"
TRIGGER_WORD="ohwx"

if [ -z "$SOURCE_DIR" ] || [ -z "$CHARACTER_NAME" ]; then
    echo "Usage: $0 <source_photos_dir> <character_name> [description]"
    echo ""
    echo "  source_photos_dir  Folder containing 15-50 photos of the person"
    echo "  character_name     Short name (e.g., 'dad', 'sarah')"
    echo "  description        Text description (e.g., 'a man in his late 60s')"
    echo ""
    echo "Example:"
    echo "  $0 ~/photos/dad dad 'a man in his late 60s with gray hair'"
    exit 1
fi

if [ ! -d "$SOURCE_DIR" ]; then
    echo "❌ Source directory not found: $SOURCE_DIR"
    exit 1
fi

DATASET_DIR="$REPO_ROOT/datasets/$CHARACTER_NAME"
mkdir -p "$DATASET_DIR"

echo "╔══════════════════════════════════════════════════╗"
echo "║  Imagen Heap — Dataset Preparation                ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Character:   $CHARACTER_NAME"
echo "  Description: $DESCRIPTION"
echo "  Trigger:     $TRIGGER_WORD"
echo "  Source:      $SOURCE_DIR"
echo "  Output:      $DATASET_DIR"
echo ""

# Copy and rename images
COUNT=0
for img in "$SOURCE_DIR"/*.{jpg,jpeg,png,JPG,JPEG,PNG,heic,HEIC} 2>/dev/null; do
    [ -f "$img" ] || continue
    COUNT=$((COUNT + 1))
    EXT="${img##*.}"
    EXT_LOWER=$(echo "$EXT" | tr '[:upper:]' '[:lower:]')

    # Convert HEIC to jpg if needed
    if [ "$EXT_LOWER" = "heic" ]; then
        if command -v sips &>/dev/null; then
            DEST="$DATASET_DIR/${CHARACTER_NAME}_$(printf '%03d' $COUNT).jpg"
            sips -s format jpeg "$img" --out "$DEST" --quiet 2>/dev/null || {
                echo "  ⚠ Skipping $img (HEIC conversion failed)"
                COUNT=$((COUNT - 1))
                continue
            }
            EXT_LOWER="jpg"
        else
            echo "  ⚠ Skipping $img (HEIC not supported without sips)"
            COUNT=$((COUNT - 1))
            continue
        fi
    else
        DEST="$DATASET_DIR/${CHARACTER_NAME}_$(printf '%03d' $COUNT).$EXT_LOWER"
        cp "$img" "$DEST"
    fi

    # Create caption file
    CAPTION_FILE="${DEST%.*}.txt"
    echo "a photo of $TRIGGER_WORD $DESCRIPTION" > "$CAPTION_FILE"

    echo "  ✓ $(basename "$DEST") → caption: 'a photo of $TRIGGER_WORD $DESCRIPTION'"
done

if [ "$COUNT" -eq 0 ]; then
    echo "❌ No images found in $SOURCE_DIR"
    echo "   Supported formats: jpg, jpeg, png, heic"
    exit 1
fi

echo ""
echo "✅ Dataset ready: $COUNT images in $DATASET_DIR"
echo ""
echo "📝 IMPORTANT: Review and customize the captions!"
echo "   Each image has a .txt caption file next to it."
echo "   For best results, vary the captions per image:"
echo ""
echo "   Good captions (varied):"
echo "     'a photo of $TRIGGER_WORD $DESCRIPTION, smiling, outdoor lighting'"
echo "     'a photo of $TRIGGER_WORD $DESCRIPTION, serious expression, indoor'"
echo "     'a photo of $TRIGGER_WORD $DESCRIPTION, side profile, natural light'"
echo ""
echo "   The trigger word '$TRIGGER_WORD' MUST appear in every caption."
echo "   It's the keyword you'll use at generation time."
echo ""
echo "   Tips for best results:"
echo "     • Use 15-50 diverse photos (angles, lighting, expressions)"
echo "     • Remove blurry, occluded, or low-quality images"
echo "     • Remove group photos or images where face isn't clearly visible"
echo "     • 1024x1024+ resolution preferred (will be auto-resized)"
echo ""
echo "Next step:"
echo "  ./scripts/train-lora.sh $DATASET_DIR $CHARACTER_NAME"
