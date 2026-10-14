#!/usr/bin/env bash
set -euo pipefail
source /opt/emsdk/emsdk_env.sh
export PATH=/work/prefix/bin:/opt/flang/host/bin:$PATH
export NF_CONFIG=/work/prefix/bin/nf-config NC_CONFIG=/work/prefix/bin/nc-config
export NETCDF_INCDIR=/work/prefix/include NETCDF_LIBS='-L/work/prefix/lib -lnetcdff -lnetcdf'
cd /work
cp native/ana_stflux.h roms/ROMS/Functionals/ana_stflux.h
touch roms/ROMS/Functionals/analytical.F
model=${1:?physical, npzd or nemuro required}
case "$model" in physical) flag=WEBROMS_PHYSICAL;; npzd) flag=NPZD_FRANKS;; nemuro) flag=NEMURO;; *) exit 2;; esac
mixing=${2:-fixed}
case "$mixing" in fixed) variant=$model; output=runtime/$model;; gls) variant=$model-gls; output=runtime/gls/$model;; *) exit 2;; esac
# Apply the small upstream metadata extension only in the build environment.
if [ "$model" = nemuro ]; then
  river_header=roms/ROMS/Nonlinear/Biology/nemuro_var.h
  river_backup=$(mktemp)
  cp "$river_header" "$river_backup"
  trap 'cp "$river_backup" "$river_header"; rm -f "$river_backup"' EXIT
  cat native/nemuro-river-var.h >> "$river_header"
  touch roms/ROMS/Modules/mod_ncparam.F
fi
build=build/roms-$variant
header=native/$variant
# ROMS preprocessing does not track changes to included application headers.
if [[ -d "$build" ]] && { ! cmp -s "native/webroms_$model.h" "$build/header-model.h" || ! cmp -s native/webroms_physical.h "$build/header-physical.h" || { [[ "$mixing" = gls ]] && ! cmp -s native/webroms_gls.h "$build/header-gls.h"; }; }; then
  rm -rf "$build"
fi
mkdir -p "$header" "$output"
cp "native/webroms_$model.h" "$header/webroms.h"
if [[ "$mixing" = gls ]]; then cat native/webroms_gls.h "native/webroms_$model.h" > "$header/webroms.h"; fi
cp native/webroms_physical.h "$header/"
find roms/ROMS/Bin -type f -exec sed -i 's/\r$//' {} \;
cmake -S roms -B "$build" -DCMAKE_TOOLCHAIN_FILE=/work/scripts/wasm-toolchain.cmake \
  -DROMS_APP=WEBROMS -DMY_HEADER_DIR="/work/$header" \
  -DROMS_EXECUTABLE=OFF -DLIBTYPE=STATIC -DMPI=OFF -DCMAKE_BUILD_TYPE=Release \
  -Dmy_fort=flang -Dmy_fc=flang '-DCPPFLAGS=-P;--traditional-cpp;-w' \
  '-DCMAKE_Fortran_FLAGS=--target=wasm32-unknown-emscripten -O2 -DWEBROMS_TYPEINFO32=1 -fintrinsic-modules-path /work/intrinsics'
cp "native/webroms_$model.h" "$build/header-model.h"
cp native/webroms_physical.h "$build/header-physical.h"
if [[ "$mixing" = gls ]]; then cp native/webroms_gls.h "$build/header-gls.h"; fi
cmake --build "$build" -j4
emar r "$build/libROMS.a" "$build/CMakeFiles/Objects.dir/f90/read_phypar.f90.o" "$build/CMakeFiles/Objects.dir/f90/nf_fread2d.f90.o"
for unit in yaml_parser ran_state inp_decode; do
  flang --target=wasm32-unknown-emscripten -O2 -fintrinsic-modules-path /work/intrinsics \
    -I"$build/module" -Iprefix/include -S -emit-llvm "$build/f90/$unit.f90" -o "$build/$unit.ll"
  sed -i -e 's/@_FortranARepeat(/@webromsRepeat(/g' -e 's/@_FortranASpread(/@webromsSpread(/g' \
    -e 's/@_FortranAioInquireLogical(/@webromsInquireLogical(/g' "$build/$unit.ll"
  emcc -O2 -c "$build/$unit.ll" -o "$build/$unit.f90.o"
  emar r "$build/libROMS.a" "$build/$unit.f90.o"
done
cmake -S sources/netcdf-fortran-4.6.2 -B build/netcdf-fortran -DCMAKE_EXPORT_COMPILE_COMMANDS=ON
python3 scripts/patch-runtime-calls.py build/netcdf-fortran prefix/lib/libnetcdff.a
flang --target=wasm32-unknown-emscripten -cpp -D"$flag" -O2 -fintrinsic-modules-path /work/intrinsics \
  -I"$build/module" -Iprefix/include -c native/bridge.f90 -o "$build/bridge.o"
emcc -O2 -Iprefix/include -c build/netcdf-abi.c -o build/netcdf-abi.o
emcc -O2 -c native/runtime-abi.c -o build/runtime-abi.o
emcc -O2 -Iprefix/include -c native/netcdf-diagnostics.c -o build/netcdf-diagnostics.o
extra=()
flang --target=wasm32-unknown-emscripten -O2 -fintrinsic-modules-path /work/intrinsics -I"$build/module" -c native/floats-bridge.f90 -o "$build/floats-bridge.o"
extra+=("$build/floats-bridge.o")
exports='["_malloc","_free","_webroms_init","_webroms_step","_webroms_time","_webroms_copy","_webroms_model","_webroms_finalize","_nc_create","_nc_def_dim","_nc_def_var","_nc_put_att_text","_nc_put_att_double","_nc_enddef","_nc_put_var_double","_nc_close","_nc_strerror"'
if [[ "$mixing" = gls ]]; then
  flang --target=wasm32-unknown-emscripten -O2 -fintrinsic-modules-path /work/intrinsics -I"$build/module" -c native/mixing-bridge.f90 -o "$build/mixing-bridge.o"
  extra+=("$build/mixing-bridge.o")
  exports+=',"_webroms_copy_mixing"'
fi
exports+=',"_webroms_checkpoint","_webroms_heat_version","_webroms_floats_version","_webroms_floats_seed","_webroms_floats_copy","_webroms_floats_pause"]'
emcc -O2 -g2 --no-entry "$build/bridge.o" "$build/libROMS.a" build/netcdf-abi.o build/runtime-abi.o build/netcdf-diagnostics.o \
  prefix/lib/libnetcdff.a prefix/lib/libnetcdf.a /opt/flang/wasm/lib/libFortranRuntime.a \
  -sMODULARIZE=1 -sEXPORT_ES6=1 -sEXPORT_NAME=createRoms -sENVIRONMENT=web,worker,node \
  -sALLOW_MEMORY_GROWTH=1 -sSTACK_SIZE=16777216 -sINITIAL_MEMORY=67108864 \
  -sFORCE_FILESYSTEM=1 -Wl,--wrap=nc_get_vara_double -Wl,--fatal-warnings \
  -sEXPORTED_RUNTIME_METHODS='["FS","ccall","cwrap","UTF8ToString","HEAP32","HEAPF64"]' \
  -sEXPORTED_FUNCTIONS="$exports" \
  "${extra[@]}" -o "$output/roms.js"
