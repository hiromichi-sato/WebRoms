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
cp -r "$repo/scripts" "$repo/native" "$root/work/"
tar -c --exclude=.git -f - -C "$repo" roms | tar -x -f - -C "$root/work/"
cp "$repo/.tools/sources/"*.tar.gz "$repo/.tools/sources/"*.f90 "$repo/.tools/sources/magic-numbers.h" "$root/work/sources/"
mkdir -p "$root/work/sources/llvm-fortran-runtime"
tar -c --exclude=.git -f - -C "$repo/.tools/openmp/fortran-runtime-source" flang flang-rt llvm | tar -x -f - -C "$root/work/sources/llvm-fortran-runtime"
emscripten=${WEBROMS_OPENMP_EMSCRIPTEN:-/home/sato/.cache/webroms-openmp/emscripten-6.0.3}
cp -a "$emscripten/." "$root/opt/emscripten-openmp/"
mkdir -p "$repo/.tools/parallel-kernels"
chroot "$root" /bin/bash /work/scripts/build-openmp-kernel.sh "${1:-physical}" 2>&1 | tee "$repo/.tools/parallel-kernels/build-${1:-physical}.log"
cp -r "$root/work/runtime/openmp/"* "$repo/.tools/parallel-kernels/"
