"""Native WASM TLS lowering for ROMS module THREADPRIVATE variables.

Flang's wasm32 threadprivate_cached lowering passes an i64 size to an i32
declaration. Keep real per-thread storage without changing ROMS expressions.
This deliberately excludes COPYIN/COPYPRIVATE and non-module storage.
"""
import pathlib
import re

DIRECTIVE = re.compile(r'^\s*!\$omp\s+threadprivate\s*\(([^\n)]+)\)\s*$', re.I | re.M)

def symbols(source):
    module = re.search(r'^\s*module\s+(?!procedure\b|function\b|subroutine\b)(\w+)', source, re.I | re.M)
    matches = list(DIRECTIVE.finditer(source))
    if not matches:
        return set()
    if not module:
        raise RuntimeError('Native TLS adapter only supports module THREADPRIVATE variables')
    names = set()
    for match in matches:
        for name in match.group(1).split(','):
            name = name.strip().lower()
            if not re.fullmatch(r'[a-z]\w*', name):
                raise RuntimeError('Unsupported THREADPRIVATE declaration: ' + name)
            names.add('_QM' + module.group(1).lower() + 'E' + name)
    return names

def remove_directives(source):
    if re.search(r'^\s*!\$omp[^\n]*\b(copyin|copyprivate)\b', source, re.I | re.M):
        raise RuntimeError('COPYIN/COPYPRIVATE require a compiler-level implementation')
    adapted = DIRECTIVE.sub('', source)
    if re.search(r'^\s*!\$omp\s+threadprivate\b', adapted, re.I | re.M):
        raise RuntimeError('Unsupported multiline THREADPRIVATE directive')
    return adapted

def patch_ir(source, names):
    lines = []
    for line in source.splitlines(keepends=True):
        match = re.match(r'^@([a-zA-Z_0-9]+)\s*=', line)
        if match and match.group(1) in names:
            if 'thread_local' not in line:
                if not re.search(r'\bglobal\b', line):
                    raise RuntimeError('Unsupported TLS global: ' + line)
                line = re.sub(r'\bglobal\b', 'thread_local(localexec) global', line, count=1)
        # Optimize only after TLS is represented correctly in LLVM IR.
        if line.startswith('attributes #'):
            line = re.sub(r'\b(optnone|noinline)\b', '', line)
        lines.append(line)
    return ''.join(lines)

def roms_symbols():
    result = set()
    for unit in pathlib.Path('/work/roms/ROMS/Modules').glob('*.F'):
        result.update(symbols(unit.read_text()))
    return result
