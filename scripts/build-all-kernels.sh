#!/usr/bin/env bash
set -euo pipefail
# Requires the existing, provisioned Linux build chroot; does not install tools.
root=${1:?build chroot required}
destination=${2:?workspace path required}
[[ -d "$root/work/build" && -d "$destination/runtime" ]]
cp "$destination/native/bridge.f90" "$root/work/native/bridge.f90"
cp "$destination/native/webroms_physical.h" "$root/work/native/webroms_physical.h"
cp "$destination/scripts/build-biology.sh" "$root/work/scripts/build-biology.sh"
for model in physical npzd nemuro; do
  for mixing in fixed gls; do
    echo "Building kernel: $model $mixing"
    log="$root/work/build/checkpoint-$model-$mixing.log"
    if ! chroot "$root" /bin/bash /work/scripts/build-biology.sh "$model" "$mixing" > "$log" 2>&1; then
      tail -n 40 "$log"
      exit 1
    fi
    if [[ "$mixing" = gls ]]; then
      source="gls/$model"
      target="$source"
    else
      source="$model"
      target="$model"
      [[ "$model" != physical ]] || target=''
    fi
    cp "$root/work/runtime/$source/roms.js" "$root/work/runtime/$source/roms.wasm" "$destination/runtime/$target/"
    echo "Kernel ready: $model $mixing"
  done
done
