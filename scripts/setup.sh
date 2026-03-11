#!/usr/bin/env bash
# ============================================================================
# Imagen Heap — Environment Setup
# ============================================================================
# Sets up the Python environment required to run Imagen Heap.
# Creates a virtual environment at ~/.imagen-heap/venv/ with all dependencies.
#
# Usage:
#   bash scripts/setup.sh          # Full setup (Homebrew + Python + deps)
#   bash scripts/setup.sh --skip-brew  # Skip Homebrew/Python install
# ============================================================================
set -euo pipefail

VENV_DIR="$HOME/.imagen-heap/venv"
APP_DIR="$HOME/.imagen-heap"
SKIP_BREW=false

for arg in "$@"; do
    case "$arg" in
        --skip-brew) SKIP_BREW=true ;;
    esac
done

echo ""
echo "🖼️  Imagen Heap — Environment Setup"
echo "===================================="
echo ""

# --- Platform checks ---
if [[ "$(uname)" != "Darwin" ]]; then
    echo "❌ Imagen Heap currently supports macOS only."
    exit 1
fi

if [[ "$(uname -m)" != "arm64" ]]; then
    echo "⚠️  Warning: Imagen Heap is optimized for Apple Silicon (M-series chips)."
    echo "   Performance on Intel Macs will be significantly limited."
    echo ""
fi

# --- Ensure app directory exists ---
mkdir -p "$APP_DIR"

# --- Homebrew ---
if [[ "$SKIP_BREW" == false ]]; then
    if ! command -v brew &>/dev/null; then
        echo "📦 Homebrew not found. Installing..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        # Add Homebrew to PATH for this session
        if [[ -f /opt/homebrew/bin/brew ]]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        fi
    else
        echo "✅ Homebrew found: $(brew --version | head -1)"
    fi

    # --- Python 3.12+ ---
    NEED_PYTHON=false
    if command -v python3 &>/dev/null; then
        PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
        PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
        PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
        if [[ "$PY_MAJOR" -lt 3 ]] || [[ "$PY_MAJOR" -eq 3 && "$PY_MINOR" -lt 11 ]]; then
            echo "⚠️  Python $PY_VERSION found, but 3.11+ is required."
            NEED_PYTHON=true
        else
            echo "✅ Python $PY_VERSION found"
        fi
    else
        NEED_PYTHON=true
    fi

    if [[ "$NEED_PYTHON" == true ]]; then
        echo "🐍 Installing Python 3.12 via Homebrew..."
        brew install python@3.12
    fi
fi

# --- Determine Python interpreter ---
# Prefer python3.12, fall back to python3
if command -v python3.12 &>/dev/null; then
    PYTHON="python3.12"
elif command -v python3 &>/dev/null; then
    PYTHON="python3"
else
    echo "❌ Python 3.11+ not found. Please install Python 3.12:"
    echo "   brew install python@3.12"
    exit 1
fi

echo "🐍 Using: $($PYTHON --version) ($PYTHON)"
echo ""

# --- Create virtual environment ---
if [[ -d "$VENV_DIR" ]]; then
    echo "♻️  Removing existing virtual environment..."
    rm -rf "$VENV_DIR"
fi

echo "🔧 Creating virtual environment at $VENV_DIR..."
$PYTHON -m venv "$VENV_DIR"

# --- Activate venv ---
source "$VENV_DIR/bin/activate"

# --- Install dependencies ---
echo ""
echo "📥 Installing Python dependencies..."
echo "   This may take 5-10 minutes on first run."
echo ""

pip install --upgrade pip --quiet

# Core inference (MLX path — fast Apple Silicon inference)
echo "   [1/5] Installing MLX inference engine (mflux)..."
pip install mflux --quiet

# Diffusers ecosystem (SDXL/FaceID path)
echo "   [2/5] Installing diffusers + transformers..."
pip install diffusers transformers accelerate safetensors --quiet

# PyTorch (CPU-only sufficient for macOS — MPS is included)
echo "   [3/5] Installing PyTorch..."
pip install torch torchvision --quiet

# Face identity (InsightFace + ONNX Runtime)
echo "   [4/5] Installing face identity packages..."
pip install insightface onnxruntime numpy --quiet

# Utilities
echo "   [5/5] Installing utilities..."
pip install Pillow tiktoken protobuf huggingface_hub --quiet

# --- Verify installation ---
echo ""
echo "🔍 Verifying installation..."
VERIFY_RESULT=$("$VENV_DIR/bin/python3" -c "
import sys
errors = []
try:
    import mflux; print(f'  ✅ mflux {mflux.__version__}')
except Exception as e:
    errors.append(f'  ❌ mflux: {e}')
try:
    import mlx.core; print(f'  ✅ mlx')
except Exception as e:
    errors.append(f'  ❌ mlx: {e}')
try:
    import diffusers; print(f'  ✅ diffusers {diffusers.__version__}')
except Exception as e:
    errors.append(f'  ❌ diffusers: {e}')
try:
    import torch; print(f'  ✅ torch {torch.__version__}')
except Exception as e:
    errors.append(f'  ❌ torch: {e}')
try:
    import PIL; print(f'  ✅ Pillow')
except Exception as e:
    errors.append(f'  ❌ Pillow: {e}')
try:
    import huggingface_hub; print(f'  ✅ huggingface_hub')
except Exception as e:
    errors.append(f'  ❌ huggingface_hub: {e}')
for err in errors:
    print(err)
if errors:
    sys.exit(1)
" 2>&1) || {
    echo "$VERIFY_RESULT"
    echo ""
    echo "⚠️  Some packages failed to install. You may need to install them manually."
    echo "   Activate the venv with: source $VENV_DIR/bin/activate"
    exit 1
}
echo "$VERIFY_RESULT"

echo ""
echo "===================================="
echo "✅ Setup complete!"
echo ""
echo "   Python venv:  $VENV_DIR"
echo "   Python:       $($VENV_DIR/bin/python3 --version)"
echo ""
echo "   You can now launch Imagen Heap."
echo "   Models will be downloaded inside the app on first run."
echo "===================================="
echo ""
