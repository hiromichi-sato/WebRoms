#!/usr/bin/env bash
set -euo pipefail
export PATH=/opt/emscripten-openmp:/work/prefix/bin:/opt/flang/host/bin:/opt/emsdk/node/22.16.0_64bit/bin:$PATH
export EM_CONFIG=/work/scripts/emscripten-openmp.config.py
unset EM_CACHE
cd /work
chmod +x scripts/flang-openmp.py
model=${1:-physical}
case "$model" in physical) flag=WEBROMS_PHYSICAL;; npzd) flag=NPZD_FRANKS;; nemuro) flag=NEMURO;; *) exit 2;; esac
mkdir -p build prefix sources runtime/openmp
if [[ ! -f build/fortran-runtime-pthread/libFortranRuntime.a ]]; then python3 scripts/build-threaded-fortran-runtime.py; fi
if [[ ! -f prefix/lib/libnetcdff.a ]]; then
  for source in sources/*.tar.gz; do tar -xzf "$source" -C sources; done
  emcmake cmake -S sources/netcdf-c-4.9.3 -B build/netcdf-c-pthread -DCMAKE_C_FLAGS=-pthread \
    -DCMAKE_INSTALL_PREFIX=/work/prefix -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF \
    -DNETCDF_ENABLE_HDF5=OFF -DNETCDF_ENABLE_DAP=OFF -DNETCDF_ENABLE_BYTERANGE=OFF \
    -DNETCDF_ENABLE_NCZARR=OFF -DNETCDF_ENABLE_PLUGINS=OFF -DNETCDF_ENABLE_TESTS=OFF \
    -DNETCDF_BUILD_UTILITIES=OFF -DNETCDF_ENABLE_EXAMPLES=OFF -DCMAKE_DISABLE_FIND_PACKAGE_ZLIB=ON -DHAVE_MREMAP=0
  cmake --build build/netcdf-c-pthread -j4
  cmake --install build/netcdf-c-pthread
  python3 scripts/prepare-abi.py
  abi_flags=$(cat build/netcdf-abi-flags.txt)
  cmake -S sources/netcdf-fortran-4.6.2 -B build/netcdf-fortran -DCMAKE_TOOLCHAIN_FILE=/work/scripts/wasm-openmp-toolchain.cmake \
    -DCMAKE_INSTALL_PREFIX=/work/prefix -DCMAKE_PREFIX_PATH=/work/prefix -DBUILD_SHARED_LIBS=OFF \
    -DENABLE_TESTS=OFF -DENABLE_EXAMPLES=OFF -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_Fortran_FLAGS="--target=wasm32-unknown-emscripten -O2 -DWEBROMS_ABI32=1 -fintrinsic-modules-path /work/intrinsics $abi_flags"
  cmake --build build/netcdf-fortran --target netcdff -j4
  cmake --install build/netcdf-fortran
fi
export NF_CONFIG=/work/prefix/bin/nf-config NC_CONFIG=/work/prefix/bin/nc-config
export NETCDF_INCDIR=/work/prefix/include NETCDF_LIBS='-L/work/prefix/lib -lnetcdff -lnetcdf'
cp native/ana_stflux.h roms/ROMS/Functionals/ana_stflux.h
find roms/ROMS/Bin -type f -exec sed -i 's/\r$//' {} \;
header=native/openmp-$model
build=build/roms-openmp-$model
mkdir -p "$header" "runtime/openmp/$model"
cp "native/webroms_$model.h" "$header/webroms.h"
cp native/webroms_physical.h "$header/"
cmake -S roms -B "$build" -DCMAKE_TOOLCHAIN_FILE=/work/scripts/wasm-openmp-toolchain.cmake \
  -DROMS_APP=WEBROMS -DMY_HEADER_DIR="/work/$header" -DROMS_EXECUTABLE=OFF -DLIBTYPE=STATIC -DMPI=OFF \
  -DCMAKE_BUILD_TYPE=Release -Dmy_fort=flang -Dmy_fc=flang '-DCPPFLAGS=-P;--traditional-cpp;-w' \
  -DMY_CPP_FLAGS=_OPENMP \
  '-DCMAKE_Fortran_FLAGS=--target=wasm32-unknown-emscripten -O2 -fopenmp -DWEBROMS_TYPEINFO32=1 -fintrinsic-modules-path /work/intrinsics'
cmake --build "$build" -j4
emar r "$build/libROMS.a" "$build/CMakeFiles/Objects.dir/f90/read_phypar.f90.o" "$build/CMakeFiles/Objects.dir/f90/nf_fread2d.f90.o"
scripts/flang-openmp.py --target=wasm32-unknown-emscripten -cpp -D"$flag" -O2 -fopenmp -fintrinsic-modules-path /work/intrinsics \
  -I"$build/module" -Iprefix/include -c native/bridge.f90 -o "$build/bridge.o"
for unit in runtime-abi netcdf-diagnostics; do emcc -O2 -pthread -Iprefix/include -c "native/$unit.c" -o "build/$unit.o"; done
emcc -O2 -pthread -Iprefix/include -c build/netcdf-abi.c -o build/netcdf-abi.o
scripts/flang-openmp.py --target=wasm32-unknown-emscripten -O2 -fopenmp -fintrinsic-modules-path /work/intrinsics \
  -I"$build/module" -c native/floats-bridge.f90 -o "$build/floats-bridge.o"
scripts/flang-openmp.py --target=wasm32-unknown-emscripten -O2 -fopenmp -fintrinsic-modules-path /work/intrinsics \
  -I"$build/module" -c native/openmp-bridge.f90 -o "$build/openmp-bridge.o"
emcc -O2 -pthread -fopenmp -c native/openmp-control.c -o "$build/openmp-control.o"
emcc -O2 -g2 -pthread -fopenmp --no-entry "$build/bridge.o" "$build/libROMS.a" build/netcdf-abi.o build/runtime-abi.o build/netcdf-diagnostics.o \
  "$build/floats-bridge.o" "$build/openmp-control.o" "$build/openmp-bridge.o" prefix/lib/libnetcdff.a prefix/lib/libnetcdf.a build/fortran-runtime-pthread/libFortranRuntime.a \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createRoms -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=16777216 -sDEFAULT_PTHREAD_STACK_SIZE=16777216 -sINITIAL_MEMORY=268435456 -sPTHREAD_POOL_SIZE=4 \
  -sFORCE_FILESYSTEM=1 -Wl,--wrap=nc_get_vara_double -Wl,--fatal-warnings \
  -sEXPORTED_RUNTIME_METHODS='["FS","ccall","cwrap","UTF8ToString","HEAP32","HEAPF64"]' \
  -sEXPORTED_FUNCTIONS='["_malloc","_free","_webroms_init","_webroms_step","_webroms_time","_webroms_copy","_webroms_model","_webroms_finalize","_webroms_set_threads","_webroms_threads","_webroms_roms_threads","_webroms_checkpoint","_webroms_heat_version","_webroms_floats_version","_webroms_floats_seed","_webroms_floats_copy","_webroms_floats_pause","_nc_create","_nc_def_dim","_nc_def_var","_nc_put_att_text","_nc_put_att_double","_nc_enddef","_nc_put_var_double","_nc_close","_nc_strerror"]' \
  -o "runtime/openmp/$model/roms.js"
