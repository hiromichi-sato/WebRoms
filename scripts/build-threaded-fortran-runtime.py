"""Rebuild the pinned r-wasm Fortran runtime, including real pthread locks."""
import concurrent.futures
import pathlib
import shutil
import subprocess

source = pathlib.Path('/work/sources/llvm-fortran-runtime')
build = pathlib.Path('/work/build/fortran-runtime-pthread')
build.mkdir(parents=True, exist_ok=True)
shutil.copyfile('/work/native/fortran-runtime-config.h', build / 'config.h')
sources = sorted((source / 'flang-rt/lib/runtime').glob('*.cpp'))
sources += [source / 'flang/lib/Decimal' / name for name in ['decimal-to-binary.cpp', 'binary-to-decimal.cpp']]
if len(sources) < 60:
    raise RuntimeError('Pinned Fortran runtime sources are incomplete')
flags = ['-O2', '-pthread', '-DFLANG_LITTLE_ENDIAN', '-fPIC', '-Wno-c++11-narrowing', '-fvisibility=hidden']
flags += ['-D' + key + '=0' for key in ['FE_UNDERFLOW', 'FE_OVERFLOW', 'FE_INEXACT', 'FE_INVALID', 'FE_DIVBYZERO', 'FE_ALL_EXCEPT']]
flags += ['-I' + str(p) for p in [build, source / 'flang/include', source / 'flang-rt/include', source / 'llvm/include']]

def compile_source(unit):
    output = build / (unit.stem + '.o')
    subprocess.run(['em++', *flags, '-c', str(unit), '-o', str(output)], check=True)
    return str(output)

with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
    objects = list(pool.map(compile_source, sources))
subprocess.run(['emar', 'rcs', str(build / 'libFortranRuntime.a'), *objects], check=True)
shutil.copyfile(source / 'llvm/LICENSE.TXT', build / 'LICENSE.LLVM.txt')
