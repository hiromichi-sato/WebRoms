#!/usr/bin/env python3
"""Compile Flang IR with the same pthread backend as the C dependencies."""
import pathlib
import subprocess
import sys
import tempfile
from openmp_tls_compat import symbols, remove_directives, patch_ir, roms_symbols

args = sys.argv[1:]
compiler = '/opt/flang/host/bin/flang'
if '-c' not in args or '-o' not in args:
    sys.exit(subprocess.call([compiler, *args]))
output = pathlib.Path(args[args.index('-o') + 1])
ir = output.with_suffix('.ll')
tls_names = set()
temporary_source = None
if '-fopenmp' in args:
    tls_names = roms_symbols()
    for index, arg in enumerate(args):
        if arg.lower().endswith(('.f90', '.f', '.f95')) and pathlib.Path(arg).is_file():
            source = pathlib.Path(arg).read_text()
            tls_names.update(symbols(source))
            adapted = remove_directives(source)
            if adapted != source:
                descriptor, temporary_source = tempfile.mkstemp(suffix='.f90', prefix='webroms-tls-')
                import os
                with os.fdopen(descriptor, 'w') as stream:
                    stream.write(adapted)
                args[index] = temporary_source
    args = ['-O0' if re_arg in ['-O1', '-O2', '-O3', '-Os'] else re_arg for re_arg in args]
args[args.index('-o') + 1] = str(ir)
args[args.index('-c')] = '-S'
try:
    subprocess.run([compiler, *args, '-emit-llvm'], check=True)
finally:
    if temporary_source:
        pathlib.Path(temporary_source).unlink()
source = ir.read_text()
for name in ['Repeat', 'Spread', 'ioInquireLogical']:
    source = source.replace('@_FortranA' + name + '(', '@webroms' + name.replace('ioInquire', 'Inquire') + '(')
ir.write_text(patch_ir(source, tls_names) if tls_names else source)
subprocess.run(['/opt/emscripten-openmp/emcc', '-O2', '-pthread', '-c', str(ir), '-o', str(output)], check=True)
