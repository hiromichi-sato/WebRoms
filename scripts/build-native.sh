#!/usr/bin/env bash
set -euo pipefail
cd /work
mkdir -p native-sources native-prefix build/native-driver
for source in sources/*.tar.gz; do tar -xzf "$source" -C native-sources; done
cmake -S native-sources/netcdf-c-4.9.3 -B build/native-netcdf-c \
  -DCMAKE_INSTALL_PREFIX=/work/native-prefix -DCMAKE_BUILD_TYPE=Release \
  -DBUILD_SHARED_LIBS=OFF -DNETCDF_ENABLE_HDF5=OFF -DNETCDF_ENABLE_DAP=OFF \
  -DNETCDF_ENABLE_BYTERANGE=OFF -DNETCDF_ENABLE_NCZARR=OFF -DNETCDF_ENABLE_PLUGINS=OFF \
  -DNETCDF_ENABLE_TESTS=OFF -DNETCDF_BUILD_UTILITIES=OFF -DNETCDF_ENABLE_EXAMPLES=OFF
cmake --build build/native-netcdf-c -j4
cmake --install build/native-netcdf-c
sed -i -e 's/netcdf_expanded_subset.F90/netcdf_expanded.F90/' \
  -e '/#include "netcdf_get_nd_expanded.F90"/d' \
  -e 's/netcdf_eightbyte_subset.F90/netcdf_eightbyte.F90/' native-sources/netcdf-fortran-4.6.2/fortran/netcdf.F90
cmake -S native-sources/netcdf-fortran-4.6.2 -B build/native-netcdf-fortran \
  -DCMAKE_Fortran_COMPILER=gfortran -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX=/work/native-prefix -DCMAKE_PREFIX_PATH=/work/native-prefix \
  -DBUILD_SHARED_LIBS=OFF -DENABLE_TESTS=OFF -DENABLE_EXAMPLES=OFF
cmake --build build/native-netcdf-fortran --target netcdff -j4
cmake --install build/native-netcdf-fortran
export PATH=/work/native-prefix/bin:$PATH
export NF_CONFIG=/work/native-prefix/bin/nf-config
export NC_CONFIG=/work/native-prefix/bin/nc-config
export NETCDF_INCDIR=/work/native-prefix/include
export NETCDF_LIBS='-L/work/native-prefix/lib -lnetcdff -lnetcdf'
cmake -S roms -B build/native-roms -DCMAKE_Fortran_COMPILER=gfortran \
  -DROMS_APP=WEBROMS -DMY_HEADER_DIR=/work/native \
  -DROMS_EXECUTABLE=OFF -DLIBTYPE=STATIC -DMPI=OFF -DCMAKE_BUILD_TYPE=Release \
  -Dmy_fort=gfortran -Dmy_fc=gfortran '-DCPPFLAGS=-P;--traditional-cpp;-w'
cmake --build build/native-roms -j4
cd build/native-driver
gfortran -cpp -O2 -I../native-roms/module -I/work/native-prefix/include \
  /work/native/bridge.f90 /work/native/reference.f90 \
  ../native-roms/libROMS.a /work/native-prefix/lib/libnetcdff.a /work/native-prefix/lib/libnetcdf.a \
  -lm -o reference
