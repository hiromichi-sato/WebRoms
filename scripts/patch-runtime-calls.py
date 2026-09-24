"""Adapt lowered calls, without changing the upstream Fortran sources."""
import json
import pathlib
import shlex
import subprocess
import sys

build = pathlib.Path(sys.argv[1])
archive = sys.argv[2]
for entry in json.loads((build / 'compile_commands.json').read_text()):
    command = shlex.split(entry['command'])
    if 'flang' not in command[0]:
        continue
    output = pathlib.Path(entry['directory']) / command[command.index('-o') + 1]
    ir = output.with_suffix('.ll')
    command[command.index('-o') + 1] = str(ir)
    command[command.index('-c')] = '-S'
    command.append('-emit-llvm')
    subprocess.run(command, cwd=entry['directory'], check=True)
    source = ir.read_text()
    adapted = source
    for name in ['Repeat', 'Spread', 'ioInquireLogical']:
        adapted = adapted.replace('@_FortranA' + name + '(', '@webroms' + name.replace('ioInquire', 'Inquire') + '(')
    if source != adapted:
        ir.write_text(adapted)
        subprocess.run(['emcc', '-O2', '-c', str(ir), '-o', str(output)], check=True)
        subprocess.run(['emar', 'r', archive, str(output)], check=True)
