#!/usr/bin/env bash
set -euo pipefail
source /opt/emsdk/emsdk_env.sh
export PATH=/work/prefix/bin:/opt/flang/host/bin:$PATH
export NF_CONFIG=/work/prefix/bin/nf-config
export NC_CONFIG=/work/prefix/bin/nc-config
export NETCDF_INCDIR=/work/prefix/include
export NETCDF_LIBS='-L/work/prefix/lib -lnetcdff -lnetcdf'
cd /work
find /work -maxdepth 1 -type f -name '*.mod' -delete
if [ "${1:-}" != '--link-only' ]; then
find roms/ROMS/Bin -type f -exec sed -i 's/\r$//' {} \;
touch roms/ROMS/Utility/yaml_parser.F
cmake -S roms -B build/roms \
  -DCMAKE_TOOLCHAIN_FILE=/work/scripts/wasm-toolchain.cmake \
  -DROMS_APP=WEBROMS -DMY_HEADER_DIR=/work/native \
  -DROMS_EXECUTABLE=OFF -DLIBTYPE=STATIC -DMPI=OFF -DCMAKE_BUILD_TYPE=Release \
  -Dmy_fort=flang -Dmy_fc=flang '-DCPPFLAGS=-P;--traditional-cpp;-w' \
  '-DCMAKE_Fortran_FLAGS=--target=wasm32-unknown-emscripten -O2 -DWEBROMS_TYPEINFO32=1 -fintrinsic-modules-path /work/intrinsics'
cmake --build build/roms -j4
emar r build/roms/libROMS.a build/roms/CMakeFiles/Objects.dir/f90/read_phypar.f90.o build/roms/CMakeFiles/Objects.dir/f90/nf_fread2d.f90.o
for unit in yaml_parser ran_state inp_decode; do
  flang --target=wasm32-unknown-emscripten -O2 -fintrinsic-modules-path /work/intrinsics \
    -Ibuild/roms/module -Iprefix/include -S -emit-llvm "build/roms/f90/$unit.f90" -o "build/$unit.ll"
  sed -i -e 's/@_FortranARepeat(/@webromsRepeat(/g' \
    -e 's/@_FortranASpread(/@webromsSpread(/g' \
    -e 's/@_FortranAioInquireLogical(/@webromsInquireLogical(/g' "build/$unit.ll"
  emcc -O2 -c "build/$unit.ll" -o "build/$unit.f90.o"
  emar r build/roms/libROMS.a "build/$unit.f90.o"
done
cmake -S sources/netcdf-fortran-4.6.2 -B build/netcdf-fortran -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
python3 scripts/patch-runtime-calls.py build/netcdf-fortran prefix/lib/libnetcdff.a
fi
flang --target=wasm32-unknown-emscripten -O2 -fintrinsic-modules-path /work/intrinsics -Ibuild/roms/module -Iprefix/include -c native/bridge.f90 -o build/bridge.o
emcc -O2 -Iprefix/include -c build/netcdf-abi.c -o build/netcdf-abi.o
emcc -O2 -c native/runtime-abi.c -o build/runtime-abi.o
emcc -O2 -Iprefix/include -c native/netcdf-diagnostics.c -o build/netcdf-diagnostics.o
mkdir -p runtime
emcc -O2 -g2 --no-entry build/bridge.o build/roms/libROMS.a build/netcdf-abi.o build/runtime-abi.o build/netcdf-diagnostics.o \
  prefix/lib/libnetcdff.a prefix/lib/libnetcdf.a /opt/flang/wasm/lib/libFortranRuntime.a \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createRoms -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=16777216 -sINITIAL_MEMORY=67108864 \
  -sFORCE_FILESYSTEM=1 -Wl,--wrap=nc_get_vara_double \
  -Wl,--fatal-warnings -sEXPORTED_RUNTIME_METHODS='["FS","ccall","cwrap","UTF8ToString","HEAP32","HEAPF64"]' \
  -sEXPORTED_FUNCTIONS='["_malloc","_free","_webroms_init","_webroms_step","_webroms_time","_webroms_copy","_webroms_finalize","_nc_create","_nc_def_dim","_nc_def_var","_nc_put_att_text","_nc_put_att_double","_nc_enddef","_nc_put_var_double","_nc_close","_nc_strerror"]' \
  -o runtime/roms.js
