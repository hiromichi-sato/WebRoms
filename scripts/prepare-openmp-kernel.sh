#!/usr/bin/env bash
set -euo pipefail
repo=$(cd "$(dirname "$0")/.." && pwd)
root=${WEBROMS_OPENMP_ROOT:-/home/sato/.cache/webroms-openmp/roms-root}
if [[ "$root" != */webroms-openmp/roms-root ]]; then echo 'Unexpected isolated build root' >&2; exit 2; fi
mkdir -p "$root"
if [[ ! -f "$root/.webroms-unpacked" ]]; then
  for layer in "$repo"/.tools/oci/layer-*.tar.gz; do
    tar --extract --gzip --file "$layer" --directory "$root" --anchored --exclude='dev/*' --exclude='proc/*' --exclude='sys/*' --no-same-owner
  done
  touch "$root/.webroms-unpacked"
fi
mkdir -p "$root/dev" "$root/work/sources" "$root/work/runtime" "$root/opt/emscripten-openmp"
if [[ ! -c "$root/dev/null" ]]; then mknod -m 666 "$root/dev/null" c 1 3; fi
tar -c -f - -C "$repo" scripts native | tar -x -f - -C "$root/work/"
tar -c --exclude=.git -f - -C "$repo" roms | tar -x -f - -C "$root/work/"
cp "$repo/.tools/sources/"*.tar.gz "$repo/.tools/sources/"*.f90 "$repo/.tools/sources/magic-numbers.h" "$root/work/sources/"
mkdir -p "$root/work/sources/llvm-fortran-runtime"
if [[ ! -f "$root/work/sources/llvm-fortran-runtime/.pinned-7ca73ca1" ]]; then
  tar -c --exclude=.git -f - -C "$repo/.tools/openmp/fortran-runtime-source" flang flang-rt llvm | tar -x -f - -C "$root/work/sources/llvm-fortran-runtime"
  touch "$root/work/sources/llvm-fortran-runtime/.pinned-7ca73ca1"
fi
emscripten=${WEBROMS_OPENMP_EMSCRIPTEN:-/home/sato/.cache/webroms-openmp/emscripten-6.0.3}
if [[ ! -f "$root/opt/emscripten-openmp/emcc.py" ]]; then cp -a "$emscripten/." "$root/opt/emscripten-openmp/"; fi
mkdir -p "$repo/.tools/parallel-kernels"
if [[ "${1:-physical}" = all ]]; then
  for mixing in gls fixed; do
    for model in physical npzd nemuro; do
      if [[ "$mixing" = fixed && "$model" = physical ]]; then continue; fi
      chroot "$root" /bin/bash /work/scripts/build-openmp-kernel.sh "$model" "$mixing" 2>&1 | tee "$repo/.tools/parallel-kernels/build-$mixing-$model.log"
    done
  done
else
  chroot "$root" /bin/bash /work/scripts/build-openmp-kernel.sh "${1:-physical}" "${2:-fixed}" 2>&1 | tee "$repo/.tools/parallel-kernels/build-${1:-physical}.log"
fi
cp -r "$root/work/runtime/openmp/"* "$repo/.tools/parallel-kernels/"
