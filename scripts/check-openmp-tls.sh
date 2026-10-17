#!/usr/bin/env bash
set -euo pipefail
cd /work
scripts/flang-openmp.py --target=wasm32-unknown-emscripten -O2 -fopenmp -fintrinsic-modules-path /work/intrinsics \
  -c native/openmp-threadprivate-check.f90 -o build/fortran-runtime-pthread/tls-probe.o
emcc -O2 -pthread -fopenmp --no-entry build/fortran-runtime-pthread/tls-probe.o native/openmp-control.c \
  build/fortran-runtime-pthread/libFortranRuntime.a -sPTHREAD_POOL_SIZE=4 -sSTACK_SIZE=1048576 \
  -sMODULARIZE=1 -sEXPORTED_FUNCTIONS=_webroms_tls_probe,_webroms_set_threads,_webroms_threads \
  -o build/fortran-runtime-pthread/tls-probe.cjs
node scripts/check-openmp-tls.cjs /work/build/fortran-runtime-pthread/tls-probe.cjs
