import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const output = new URL('../.tools/sources/', import.meta.url);
await mkdir(output, { recursive: true });
for (const [name, url, expected] of [
  ['netcdf-c-4.9.3', 'https://codeload.github.com/Unidata/netcdf-c/tar.gz/refs/tags/v4.9.3', '990f46d49525d6ab5dc4249f8684c6deeaf54de6fec63a187e9fb382cc0ffdff'],
  ['netcdf-fortran-4.6.2', 'https://codeload.github.com/Unidata/netcdf-fortran/tar.gz/refs/tags/v4.6.2', '44cc7b5626b0b054a8503b8fe7c1b0ac4e0a79a69dad792c212454906a9224ca']
]) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${name}: HTTP ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  const sha256 = createHash('sha256').update(data).digest('hex');
  if (sha256 !== expected) throw new Error(`${name}: source checksum mismatch`);
  await writeFile(new URL(`${name}.tar.gz`, output), data);
  await writeFile(new URL(`${name}.json`, output), JSON.stringify({ url, sha256 }, null, 2));
  console.log(name, data.length, sha256);
}
