"""Generate wasm32 interop adapters; no ROMS numerical expressions are changed."""
import json
import pathlib
import re
import shutil
import subprocess

root = pathlib.Path('/work')
intrinsics = root / 'intrinsics'
intrinsics.mkdir(exist_ok=True)
for module in pathlib.Path('/opt/flang/host/include/flang').glob('*.mod'):
    shutil.copy2(module, intrinsics / module.name)
shutil.copy2(root / 'sources/magic-numbers.h', intrinsics / 'magic-numbers.h')
for name in ['__fortran_builtins', '__fortran_type_info']:
    source = (root / 'sources' / (name + '.f90')).read_text()
    source = source.replace('../include/flang/Runtime/magic-numbers.h', 'magic-numbers.h')
    source = source.replace('integer(kind=int64), private :: __address', 'integer(kind=4), private :: __address')
    target = intrinsics / (name + '.f90')
    target.write_text(source)
    subprocess.run(['flang', '--target=wasm32-unknown-emscripten', '-cpp', '-fsyntax-only', '-module-dir', str(intrinsics), str(target)], check=True)
    shutil.copy2(intrinsics / (name + '.mod'), '/opt/flang/host/include/flang/' + name + '.mod')
source = (root / 'sources/iso_c_binding.f90').read_text()
source = source.replace('c_long = c_int64_t', 'c_long = c_int32_t')
source = source.replace('c_size_t = kind(c_sizeof(1))', 'c_size_t = c_int32_t')
source = source.replace('c_unsigned_long = c_uint64_t', 'c_unsigned_long = c_uint32_t')
source = source.replace('c_unsigned_long_long = c_unsigned_long', 'c_unsigned_long_long = c_uint64_t')
(intrinsics / 'iso_c_binding.f90').write_text(source)
subprocess.run(['flang', '--target=wasm32-unknown-emscripten', '-cpp', '-fsyntax-only', '-fintrinsic-modules-path', str(intrinsics), '-module-dir', str(intrinsics), str(intrinsics / 'iso_c_binding.f90')], check=True)
# Flang 21 searches its installed intrinsic directory before additional paths.
shutil.copy2(intrinsics / 'iso_c_binding.mod', '/opt/flang/host/include/flang/iso_c_binding.mod')

header = root / 'prefix/include/netcdf.h'
ast = json.loads(subprocess.check_output(['emcc', '-I/work/prefix/include', '-include', 'netcdf.h', '-Xclang', '-ast-dump=json', '-fsyntax-only', str(header.with_name('netcdf_mem.h'))]))
functions = {}
def visit(node):
    if node.get('kind') == 'FunctionDecl':
        functions[node['name']] = node
    for child in node.get('inner', []):
        visit(child)
visit(ast)
interfaces = (root / 'sources/netcdf-fortran-4.6.2/fortran/module_netcdf_nc_interfaces.F90').read_text()
adapters = {}
for block in re.split(r'(?im)^\s*end\s*interface\s*$', interfaces):
    block = re.sub(r'!.*', '', block)
    match = re.search(r'(?i)\bfunction\s+(nc_\w+)\s*\(', block)
    if not match or not re.search(r'(?i)bind\s*\(\s*c\b', block):
        continue
    name = match.group(1).lower()
    lengths = 0
    for line in block.splitlines():
        if re.match(r'(?i)\s*character', line) and '::' in line:
            lengths += len(line.split('::', 1)[1].split(','))
    if lengths and name in functions:
        adapters[name] = lengths
code = ['#include <netcdf.h>', '#include <netcdf_mem.h>', '#include <stdint.h>']
for name, lengths in sorted(adapters.items()):
    node = functions[name]
    params = [p for p in node.get('inner', []) if p['kind'] == 'ParmVarDecl']
    declarations = [p['type']['qualType'] + ' a' + str(i) for i, p in enumerate(params)]
    declarations += ['int32_t len' + str(i) for i in range(lengths)]
    args = ', '.join('a' + str(i) for i in range(len(params)))
    code.append('int webroms_' + name + '(' + ', '.join(declarations) + ') { return ' + name + '(' + args + '); }')
(root / 'build/netcdf-abi.c').write_text('\n'.join(code) + '\n')
(root / 'build/netcdf-abi-flags.txt').write_text(' '.join('-D' + name + '=webroms_' + name for name in sorted(adapters)))
for name in adapters:
    interfaces = re.sub(r'(?i)(bind\s*\(\s*c\s*,\s*name\s*=\s*[\"\x27])' + name + r'([\"\x27])', r'\1webroms_' + name + r'\2', interfaces)
(root / 'sources/netcdf-fortran-4.6.2/fortran/module_netcdf_nc_interfaces.F90').write_text(interfaces)
print('Generated', len(adapters), 'NetCDF character ABI adapters')

# ROMS passes fixed-length start/count vectors with unused trailing entries.
# Use the upstream legacy wrappers, which query each variable's actual rank.
module = root / 'sources/netcdf-fortran-4.6.2/fortran/netcdf.F90'
source = module.read_text().replace('"netcdf_expanded_subset.F90"', '"netcdf_expanded.F90"')
source = source.replace('#include "netcdf_get_nd_expanded.F90"', '')
source = source.replace('"netcdf_eightbyte_subset.F90"', '"netcdf_eightbyte.F90"')
module.write_text(source)
