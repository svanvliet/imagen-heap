#!/usr/bin/env bash
# generate-from-lora.sh — Generate images using a trained LoRA
# Usage: ./scripts/generate-from-lora.sh <lora_path> <prompt> [options]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

LORA_PATH="${1:-}"
PROMPT="${2:-}"
STEPS="${3:-25}"
CFG="${4:-4.0}"
LORA_SCALE="${5:-1.0}"
NUM_IMAGES="${6:-4}"
SEED="${7:-42}"

if [ -z "$LORA_PATH" ] || [ -z "$PROMPT" ]; then
    echo "Usage: $0 <lora_path> <prompt> [steps] [cfg] [lora_scale] [num_images] [seed]"
    echo ""
    echo "  lora_path    Path to trained .safetensors LoRA file"
    echo "  prompt       Generation prompt (include 'ohwx' trigger word!)"
    echo "  steps        Inference steps (default: 25)"
    echo "  cfg          Guidance scale (default: 4.0)"
    echo "  lora_scale   LoRA strength 0.0-1.5 (default: 1.0)"
    echo "  num_images   How many images to generate (default: 4)"
    echo "  seed         Starting seed (default: 42, increments per image)"
    echo ""
    echo "Examples:"
    echo "  $0 output/dad_v1/dad_v1.safetensors 'a photo of ohwx man at a birthday party'"
    echo "  $0 output/dad_v1/dad_v1.safetensors 'ohwx man as a knight' 30 5.0 0.8 8"
    exit 1
fi

if [ ! -f "$LORA_PATH" ]; then
    echo "❌ LoRA file not found: $LORA_PATH"
    exit 1
fi

# Check for trigger word
if [[ "$PROMPT" != *"ohwx"* ]]; then
    echo "⚠ Warning: Prompt doesn't contain trigger word 'ohwx'."
    echo "  The LoRA was trained with this trigger. Add it for best results."
    echo "  Example: 'a photo of ohwx man at a park'"
    echo ""
fi

# Check HF token
if [ -z "${HF_TOKEN:-}" ]; then
    TOKEN_FILE="$HOME/.imagen-heap/models/.hf_token"
    if [ -f "$TOKEN_FILE" ]; then
        export HF_TOKEN=$(cat "$TOKEN_FILE")
    else
        echo "❌ HF_TOKEN not set. FLUX.1-dev requires authentication."
        exit 1
    fi
fi

OUTPUT_DIR="$REPO_ROOT/output/generated_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$OUTPUT_DIR"

echo "╔══════════════════════════════════════════════════╗"
echo "║  Imagen Heap — LoRA Generation Test               ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""
echo "  LoRA:       $(basename "$LORA_PATH")"
echo "  Prompt:     $PROMPT"
echo "  Steps:      $STEPS"
echo "  CFG:        $CFG"
echo "  LoRA scale: $LORA_SCALE"
echo "  Images:     $NUM_IMAGES"
echo "  Seeds:      $SEED to $((SEED + NUM_IMAGES - 1))"
echo "  Output:     $OUTPUT_DIR"
echo ""

# Generate using Python/diffusers directly
python3 << PYEOF
import os, sys, time
os.environ["HF_TOKEN"] = "$HF_TOKEN"
os.environ["HUGGING_FACE_HUB_TOKEN"] = "$HF_TOKEN"

import torch
from diffusers import FluxPipeline

lora_path = "$LORA_PATH"
prompt = """$PROMPT"""
steps = $STEPS
cfg = $CFG
lora_scale = $LORA_SCALE
num_images = $NUM_IMAGES
base_seed = $SEED
output_dir = "$OUTPUT_DIR"

print("Loading FLUX.1-dev pipeline...")
start = time.time()
pipe = FluxPipeline.from_pretrained(
    "black-forest-labs/FLUX.1-dev",
    torch_dtype=torch.bfloat16,
    token=os.environ["HF_TOKEN"],
)
# Enable MPS if available
if torch.backends.mps.is_available():
    pipe = pipe.to("mps")
    print(f"Pipeline loaded on MPS in {time.time()-start:.1f}s")
else:
    pipe.enable_model_cpu_offload()
    print(f"Pipeline loaded with CPU offload in {time.time()-start:.1f}s")

print(f"Loading LoRA from {lora_path}...")
pipe.load_lora_weights(lora_path)
print(f"LoRA loaded (scale={lora_scale})")

for i in range(num_images):
    seed = base_seed + i
    print(f"\nGenerating image {i+1}/{num_images} (seed={seed})...")
    gen_start = time.time()

    generator = torch.Generator(device="cpu").manual_seed(seed)
    image = pipe(
        prompt=prompt,
        num_inference_steps=steps,
        guidance_scale=cfg,
        width=1024,
        height=1024,
        generator=generator,
        joint_attention_kwargs={"scale": lora_scale},
    ).images[0]

    filename = f"lora_seed{seed}.png"
    filepath = os.path.join(output_dir, filename)
    image.save(filepath)
    elapsed = time.time() - gen_start
    print(f"  ✓ Saved {filename} ({elapsed:.1f}s)")

print(f"\n✅ Generated {num_images} images in {output_dir}")
print(f"\nOpen in Finder: open {output_dir}")
PYEOF

echo ""
echo "🖼  Images saved to: $OUTPUT_DIR"
echo "    Open with: open $OUTPUT_DIR"
echo ""
echo "💡 Tips for evaluating quality:"
echo "   • Does the face match the reference photos?"
echo "   • Try different prompts — does identity hold across scenes?"
echo "   • Try lora_scale 0.8 if images look too 'baked in'"
echo "   • Try lora_scale 1.2 if identity is too weak"
echo "   • If overtrained: use fewer steps next time (try 1500)"
echo "   • If undertrained: use more steps (try 3000-4000)"
