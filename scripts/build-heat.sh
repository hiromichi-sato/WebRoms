#!/usr/bin/env bash
set -euo pipefail
for mixing in gls fixed; do
  for model in physical npzd nemuro; do
    bash /work/scripts/build-biology.sh "$model" "$mixing"
  done
done
cp /work/runtime/physical/roms.js /work/runtime/roms.js
cp /work/runtime/physical/roms.wasm /work/runtime/roms.wasm
