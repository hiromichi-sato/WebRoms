#!/usr/bin/env bash
set -euo pipefail
source /opt/emsdk/emsdk_env.sh
export PATH=/opt/flang/host/bin:$PATH
cd /work
mkdir -p sources build prefix
for source in sources/*.tar.gz; do tar -xzf "$source" -C sources; done
emcmake cmake -S sources/netcdf-c-4.9.3 -B build/netcdf-c \
  -DCMAKE_INSTALL_PREFIX=/work/prefix -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF -DNETCDF_ENABLE_HDF5=OFF -DNETCDF_ENABLE_DAP=OFF \
  -DNETCDF_ENABLE_BYTERANGE=OFF -DNETCDF_ENABLE_NCZARR=OFF -DNETCDF_ENABLE_PLUGINS=OFF \
  -DNETCDF_ENABLE_TESTS=OFF -DNETCDF_BUILD_UTILITIES=OFF -DNETCDF_ENABLE_EXAMPLES=OFF \
  -DCMAKE_DISABLE_FIND_PACKAGE_ZLIB=ON -DZLIB_LIBRARY= -DHAVE_MREMAP=0
cmake --build build/netcdf-c -j4
cmake --install build/netcdf-c
python3 scripts/prepare-abi.py
ABI_FLAGS=$(cat build/netcdf-abi-flags.txt)
cmake -S sources/netcdf-fortran-4.6.2 -B build/netcdf-fortran \
  -DCMAKE_TOOLCHAIN_FILE=/work/scripts/wasm-toolchain.cmake \
  -DCMAKE_INSTALL_PREFIX=/work/prefix -DCMAKE_PREFIX_PATH=/work/prefix \
  -DBUILD_SHARED_LIBS=OFF -DENABLE_TESTS=OFF -DENABLE_EXAMPLES=OFF \
  -DCMAKE_EXPORT_COMPILE_COMMANDS=ON \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_Fortran_FLAGS="--target=wasm32-unknown-emscripten -O2 -DWEBROMS_ABI32=1 -fintrinsic-modules-path /work/intrinsics $ABI_FLAGS"
cmake --build build/netcdf-fortran --target netcdff --clean-first -j4
cmake --install build/netcdf-fortran
