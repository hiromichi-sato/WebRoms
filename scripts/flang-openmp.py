#!/usr/bin/env python3
"""Compile Flang IR with the same pthread backend as the C dependencies."""
import pathlib
import subprocess
import sys

args = sys.argv[1:]
compiler = '/opt/flang/host/bin/flang'
if '-c' not in args or '-o' not in args:
    sys.exit(subprocess.call([compiler, *args]))
output = pathlib.Path(args[args.index('-o') + 1])
ir = output.with_suffix('.ll')
args[args.index('-o') + 1] = str(ir)
args[args.index('-c')] = '-S'
subprocess.run([compiler, *args, '-emit-llvm'], check=True)
source = ir.read_text()
for name in ['Repeat', 'Spread', 'ioInquireLogical']:
    source = source.replace('@_FortranA' + name + '(', '@webroms' + name.replace('ioInquire', 'Inquire') + '(')
ir.write_text(source)
subprocess.run(['/opt/emscripten-openmp/emcc', '-O2', '-pthread', '-c', str(ir), '-o', str(output)], check=True)
