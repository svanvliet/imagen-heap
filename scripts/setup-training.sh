#!/usr/bin/env bash
# setup-training.sh — One-time setup for LoRA training environment
# Uses ostris/ai-toolkit for FLUX LoRA training on Apple Silicon
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
TRAINING_DIR="$REPO_ROOT/.training-env"

echo "╔══════════════════════════════════════════════════╗"
echo "║  Imagen Heap — LoRA Training Environment Setup   ║"
echo "╚══════════════════════════════════════════════════╝"
echo ""

# Check prerequisites
if ! command -v python3 &>/dev/null; then
    echo "❌ python3 not found. Install Python 3.10+ first."
    exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "✓ Python $PYTHON_VERSION"

if ! python3 -c "import torch; assert torch.backends.mps.is_available()" 2>/dev/null; then
    echo "⚠ PyTorch MPS not available. Training will use CPU (very slow)."
fi

# Create isolated venv for training (separate from app)
if [ -d "$TRAINING_DIR" ]; then
    echo ""
    echo "Training environment already exists at: $TRAINING_DIR"
    read -p "Re-create from scratch? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$TRAINING_DIR"
    else
        echo "Skipping setup. Activate with: source $TRAINING_DIR/venv/bin/activate"
        exit 0
    fi
fi

mkdir -p "$TRAINING_DIR"
cd "$TRAINING_DIR"

echo ""
echo "📦 Creating Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

echo "📦 Installing PyTorch (MPS-enabled)..."
pip install --quiet torch torchvision torchaudio

echo "📦 Cloning ai-toolkit..."
if [ -d "ai-toolkit" ]; then
    cd ai-toolkit && git pull --quiet && cd ..
else
    git clone --quiet https://github.com/ostris/ai-toolkit.git
fi

echo "📦 Installing ai-toolkit dependencies..."
cd ai-toolkit
git submodule update --init --recursive --quiet 2>/dev/null || true
pip install --quiet -r requirements.txt 2>/dev/null || {
    echo "⚠ Some requirements failed. Installing core deps manually..."
    pip install --quiet diffusers transformers accelerate safetensors peft bitsandbytes pillow pyyaml
}
cd ..

echo "📦 Installing additional tools..."
pip install --quiet accelerate safetensors pillow

echo ""
echo "✅ Training environment ready!"
echo ""
echo "   Location:  $TRAINING_DIR"
echo "   Activate:  source $TRAINING_DIR/venv/bin/activate"
echo "   AI Toolkit: $TRAINING_DIR/ai-toolkit/"
echo ""
echo "Next steps:"
echo "  1. Prepare your dataset:  ./scripts/prepare-dataset.sh ~/photos 'dad' 'a man in his late 60s'"
echo "  2. Train:                 ./scripts/train-lora.sh datasets/dad 'dad'"
echo ""
echo "💡 You'll need a HuggingFace token with access to FLUX.1-dev."
echo "   Get one at: https://huggingface.co/settings/tokens"
echo "   Then: export HF_TOKEN=hf_your_token_here"
