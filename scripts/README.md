# LoRA Training Scripts for Imagen Heap

These scripts let you train and test a character face LoRA locally before
integrating into the app. This is a manual validation workflow.

## Quick Start

```bash
# 1. Set up training environment (one-time)
./scripts/setup-training.sh

# 2. Prepare your dataset
./scripts/prepare-dataset.sh ~/my-photos "dad" "a man in his late 60s"

# 3. Train the LoRA (2-4 hours on M3 Max)
./scripts/train-lora.sh datasets/dad "dad"

# 4. Generate test images with the trained LoRA
./scripts/generate-from-lora.sh output/dad_v1/dad_v1.safetensors "a photo of ohwx man at a birthday party"
```

See each script for detailed options and parameters.
