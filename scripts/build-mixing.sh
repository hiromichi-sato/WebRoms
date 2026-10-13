#!/usr/bin/env bash
set -euo pipefail
for model in physical npzd nemuro; do
  bash /work/scripts/build-biology.sh "$model" gls
done
