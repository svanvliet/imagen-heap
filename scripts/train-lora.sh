#!/usr/bin/env bash
# train-lora.sh — Train a FLUX LoRA for a character face
# Usage: ./scripts/train-lora.sh <dataset_dir> <character_name> [steps]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TRAINING_DIR="$REPO_ROOT/.training-env"

DATASET_DIR="${1:-}"
CHARACTER_NAME="${2:-}"
STEPS="${3:-2000}"
TRIGGER_WORD="ohwx"

if [ -z "$DATASET_DIR" ] || [ -z "$CHARACTER_NAME" ]; then
    echo "Usage: $0 <dataset_dir> <character_name> [steps]"
    echo ""
    echo "  dataset_dir      Path to prepared dataset (from prepare-dataset.sh)"
    echo "  character_name    Short name (e.g., 'dad')"
    echo "  steps            Training steps (default: 2000, try 1500-4000)"
    echo ""
    echo "Example:"
    echo "  $0 datasets/dad dad 2000"
    exit 1
fi

# Resolve to absolute path
DATASET_DIR="$(cd "$DATASET_DIR" 2>/dev/null && pwd)" || {
    echo "❌ Dataset directory not found: $DATASET_DIR"
    exit 1
}

# Check training environment
if [ ! -d "$TRAINING_DIR/venv" ]; then
    echo "❌ Training environment not set up. Run: ./scripts/setup-training.sh"
    exit 1
fi

# Check HF token
if [ -z "${HF_TOKEN:-}" ]; then
    # Try loading from app's saved token
    TOKEN_FILE="$HOME/.imagen-heap/models/.hf_token"
    if [ -f "$TOKEN_FILE" ]; then
        export HF_TOKEN=$(cat "$TOKEN_FILE")
        echo "✓ Using HuggingFace token from Imagen Heap"
    else
        echo "❌ HF_TOKEN not set. FLUX.1-dev requires authentication."
        echo "   Get a token at: https://huggingface.co/settings/tokens"
        echo "   Then: export HF_TOKEN=hf_your_token_here"
        exit 1
    fi
fi

# Count images
IMG_COUNT=$(find "$DATASET_DIR" -maxdepth 1 \( -name "*.jpg" -o -name "*.jpeg" -o -name "*.png" \) | wc -l | tr -d ' ')
echo "╔══════════════════════════════════════════════════╗"
echo "║  Imagen Heap — FLUX LoRA Training                 ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  Character:    $CHARACTER_NAME"
echo "  Dataset:      $DATASET_DIR ($IMG_COUNT images)"
echo "  Steps:        $STEPS"
echo "  Trigger word: $TRIGGER_WORD"
echo "  Base model:   FLUX.1-dev"
echo ""

if [ "$IMG_COUNT" -lt 10 ]; then
    echo "⚠ Warning: Only $IMG_COUNT images. 15-30+ recommended for good results."
fi

OUTPUT_DIR="$REPO_ROOT/output/${CHARACTER_NAME}_v1"
mkdir -p "$OUTPUT_DIR"

# Generate ai-toolkit config
CONFIG_FILE="$OUTPUT_DIR/train_config.yaml"
cat > "$CONFIG_FILE" << YAML
job: extension
config:
  name: "${CHARACTER_NAME}_v1"
  process:
    - type: 'sd_trainer'
      training_folder: "${OUTPUT_DIR}"
      device: mps
      trigger_word: "${TRIGGER_WORD}"
      network:
        type: "lora"
        linear: 16
        linear_alpha: 16
      save:
        dtype: float16
        save_every: 500
        max_step_saves_to_keep: 3
        push_to_hub: false
      datasets:
        - folder_path: "${DATASET_DIR}"
          caption_ext: "txt"
          caption_dropout_rate: 0.05
          shuffle_tokens: false
          cache_latents_to_disk: true
          resolution: [ 512, 768, 1024 ]
          num_workers: 0
      train:
        batch_size: 1
        steps: ${STEPS}
        gradient_accumulation_steps: 1
        train_unet: true
        train_text_encoder: false
        gradient_checkpointing: true
        noise_scheduler: "flowmatch"
        optimizer: "adamw8bit"
        lr: 1e-4
        ema_config:
          use_ema: true
          ema_decay: 0.99
        dtype: bf16
      model:
        name_or_path: "black-forest-labs/FLUX.1-dev"
        is_flux: true
        quantize: true
        qtype: "qint8"
      sample:
        sampler: "flowmatch"
        sample_every: 500
        width: 1024
        height: 1024
        prompts:
          - "a photo of ${TRIGGER_WORD}, portrait, studio lighting, neutral background"
          - "a photo of ${TRIGGER_WORD}, smiling, outdoor park, natural light"
          - "a photo of ${TRIGGER_WORD}, serious expression, wearing a suit, office"
          - "a photo of ${TRIGGER_WORD}, candid shot at a birthday party"
          - "a photo of ${TRIGGER_WORD}, close up headshot, dramatic lighting"
        neg: ""
        seed: 42
        walk_seed: true
        guidance_scale: 4
        sample_steps: 20
meta:
  name: "[name]"
  version: '1.0'
YAML

echo "  Config:       $CONFIG_FILE"
echo "  Output:       $OUTPUT_DIR"
echo ""
echo "📋 Training config saved. Review it at:"
echo "   $CONFIG_FILE"
echo ""

# Activate training env and run
source "$TRAINING_DIR/venv/bin/activate"
cd "$TRAINING_DIR/ai-toolkit"

echo "🚀 Starting training... (this will take 2-4 hours on M3 Max)"
echo "   Sample images will be saved every 500 steps to check progress."
echo "   You can stop early with Ctrl+C if samples look good."
echo ""
echo "   Watch for sample outputs in: $OUTPUT_DIR/samples/"
echo ""

# Set HF token for the training process
export HUGGING_FACE_HUB_TOKEN="$HF_TOKEN"

python run.py "$CONFIG_FILE"

echo ""
echo "✅ Training complete!"
echo ""
echo "   LoRA weights: $OUTPUT_DIR/${CHARACTER_NAME}_v1.safetensors"
echo "   Samples:      $OUTPUT_DIR/samples/"
echo ""
echo "Next step — test generation:"
echo "  ./scripts/generate-from-lora.sh $OUTPUT_DIR/${CHARACTER_NAME}_v1.safetensors 'a photo of $TRIGGER_WORD at a beach sunset'"
