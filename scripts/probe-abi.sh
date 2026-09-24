#!/usr/bin/env bash
set -euo pipefail
cd /work
/opt/flang/host/bin/flang --target=wasm32-unknown-emscripten -O2 -fintrinsic-modules-path /work/intrinsics -S -emit-llvm native/abi-probe.f90 -o build/probe.ll
cat build/probe.ll
/opt/flang/host/bin/flang --target=wasm32-unknown-emscripten -O2 -I/work/intrinsics -fintrinsic-modules-path /work/intrinsics -S -emit-llvm native/abi-probe.f90 -o build/probe-include.ll
cat build/probe-include.ll
