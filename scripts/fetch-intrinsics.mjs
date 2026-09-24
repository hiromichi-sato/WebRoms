import { mkdir, writeFile } from 'node:fs/promises';
const root = new URL('../.tools/sources/', import.meta.url);
await mkdir(root, { recursive: true });
const commit = '7ca73ca1ab129c86e63fd3a25aaa58bbf4b5d88c';
for (const [path, name] of [['flang/module/iso_c_binding.f90', 'iso_c_binding.f90'], ['flang/module/__fortran_type_info.f90', '__fortran_type_info.f90'], ['flang/module/__fortran_builtins.f90', '__fortran_builtins.f90'], ['flang/include/flang/Runtime/magic-numbers.h', 'magic-numbers.h'], ['LICENSE.TXT', 'LICENSE_LLVM.txt']]) {
  const response = await fetch(`https://raw.githubusercontent.com/r-wasm/llvm-project/${commit}/${path}`);
  if (!response.ok) throw new Error(String(response.status));
  await writeFile(new URL(name, root), await response.text());
}
