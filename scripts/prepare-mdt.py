"""Extract a lossless, packed MDT-only atlas for the offline browser."""
import argparse
import hashlib
import json
from pathlib import Path

import netCDF4
import numpy as np

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('input', type=Path)
parser.add_argument('--output', type=Path, default=Path('src/data/mdt'))
args = parser.parse_args()
with netCDF4.Dataset(args.input) as dataset:
    variable = dataset['mdt']
    if variable.units != 'm' or variable.dimensions != ('time', 'latitude', 'longitude') or variable.shape[0] != 1:
        raise ValueError('Expected one mdt(time,latitude,longitude) field in metres')
    variable.set_auto_maskandscale(False)
    raw = variable[0]
    valid = raw != variable._FillValue
    if not valid.any() or raw[valid].min() <= -32768 or raw[valid].max() > 32767:
        raise ValueError('MDT packed values do not fit signed 16 bits')
    if float(getattr(variable, 'add_offset', 0)) != 0:
        raise ValueError('Unexpected offset')
    x, y = dataset['longitude'][:], dataset['latitude'][:]
    dx, dy = float(x[1] - x[0]), float(y[1] - y[0])
    if dx <= 0 or dy <= 0 or not np.allclose(np.diff(x), dx) or not np.allclose(np.diff(y), dy) or not np.isclose(len(x) * dx, 360):
        raise ValueError('Expected regular, ascending, periodic global coordinates')
    packed = np.where(valid, raw, -32768).astype('<i2').tobytes()
    metadata = dict(format='webroms-mdt-i16-v1', nx=len(x), ny=len(y), x0=float(x[0]), y0=float(y[0]), dx=dx, dy=dy,
                    scale=float(variable.scale_factor), missing=-32768, units='m', verticalDatum='geoid', tideIncluded=False,
                    title=dataset.title, sourceFile=args.input.name, sourceSha256=hashlib.sha256(args.input.read_bytes()).hexdigest(),
                    sha256=hashlib.sha256(packed).hexdigest(), bytes=len(packed), validCells=int(valid.sum()),
                    sourceAttributes={a: dataset.getncattr(a) for a in dataset.ncattrs()},
                    processing='MDT only; original packed values and 1/8-degree grid retained; missing values remapped to -32768; little-endian int16. No velocity or error variables included.',
                    copyright='CNES / CLS / E.U. Copernicus Marine Service',
                    productUrl='https://www.aviso.altimetry.fr/en/data/products/auxiliary-products/mdt/mdt-global-hybrid-cnes-cls-cmems.html')
args.output.mkdir(parents=True, exist_ok=True)
(args.output / 'atlas.bin').write_bytes(packed)
(args.output / 'metadata.json').write_text(json.dumps(metadata, indent=2, default=str) + '\n', encoding='utf-8')
print(f'MDT: {len(packed):,} bytes, {metadata["validCells"]:,} valid cells; original unchanged')
