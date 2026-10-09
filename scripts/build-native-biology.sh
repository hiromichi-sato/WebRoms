#!/usr/bin/env bash
set -euo pipefail
cd /work
model=${1:?npzd or nemuro required}
case "$model" in npzd) flag=NPZD_FRANKS;; nemuro) flag=NEMURO;; *) exit 2;; esac
if [ "$model" = nemuro ]; then
  river_header=roms/ROMS/Nonlinear/Biology/nemuro_var.h
  river_backup=$(mktemp)
  cp "$river_header" "$river_backup"
  trap 'cp "$river_backup" "$river_header"; rm -f "$river_backup"' EXIT
  cat native/nemuro-river-var.h >> "$river_header"
  touch roms/ROMS/Modules/mod_ncparam.F
fi
export PATH=/work/native-prefix/bin:$PATH
export NF_CONFIG=/work/native-prefix/bin/nf-config NC_CONFIG=/work/native-prefix/bin/nc-config
export NETCDF_INCDIR=/work/native-prefix/include NETCDF_LIBS='-L/work/native-prefix/lib -lnetcdff -lnetcdf'
build=build/native-$model
header=native/$model
if [[ -d "$build" ]] && { ! cmp -s "native/webroms_$model.h" "$build/header-model.h" || ! cmp -s native/webroms_physical.h "$build/header-physical.h"; }; then
  rm -rf "$build"
fi
mkdir -p "$header"
cp "native/webroms_$model.h" "$header/webroms.h"
cp native/webroms_physical.h "$header/"
find roms/ROMS/Bin -type f -exec sed -i 's/\r$//' {} \;
cmake -S roms -B "$build" -DCMAKE_Fortran_COMPILER=gfortran \
  -DROMS_APP=WEBROMS -DMY_HEADER_DIR="/work/native/$model" \
  -DROMS_EXECUTABLE=OFF -DLIBTYPE=STATIC -DMPI=OFF -DCMAKE_BUILD_TYPE=Release \
  -Dmy_fort=gfortran -Dmy_fc=gfortran '-DCPPFLAGS=-P;--traditional-cpp;-w'
cp "native/webroms_$model.h" "$build/header-model.h"
cp native/webroms_physical.h "$build/header-physical.h"
cmake --build "$build" -j4
gfortran -cpp -D"$flag" -O2 -I"$build/module" -Inative-prefix/include \
  native/bridge.f90 native/reference.f90 "$build/libROMS.a" \
  native-prefix/lib/libnetcdff.a native-prefix/lib/libnetcdf.a -lm -o "$build/reference"
